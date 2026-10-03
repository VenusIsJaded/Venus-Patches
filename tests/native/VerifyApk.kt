import com.android.apksig.ApkVerifier
import com.android.tools.smali.dexlib2.DexFileFactory
import com.android.tools.smali.dexlib2.Opcodes
import com.android.tools.smali.dexlib2.Opcode
import com.android.tools.smali.dexlib2.iface.ClassDef
import com.android.tools.smali.dexlib2.iface.Method
import com.android.tools.smali.dexlib2.iface.Field
import com.android.tools.smali.dexlib2.iface.reference.FieldReference
import com.android.tools.smali.dexlib2.iface.reference.TypeReference
import com.android.tools.smali.dexlib2.iface.instruction.ReferenceInstruction
import com.android.tools.smali.dexlib2.iface.instruction.FiveRegisterInstruction
import com.android.tools.smali.dexlib2.iface.instruction.OneRegisterInstruction
import com.android.tools.smali.dexlib2.iface.instruction.TwoRegisterInstruction
import com.android.tools.smali.dexlib2.iface.instruction.ThreeRegisterInstruction
import com.android.tools.smali.dexlib2.iface.reference.MethodReference
import com.android.tools.smali.dexlib2.iface.reference.StringReference
import java.io.File
import java.security.MessageDigest
import java.util.zip.ZipFile

fun main(args: Array<String>) {
    require(args.isNotEmpty()) { "Usage: VerifyApkKt patched.apk [signed]" }
    val apk = File(args[0])
    ZipFile(apk).use { zip ->
        val script = zip.getInputStream(zip.getEntry("assets/venus/bootstrap.js")).bufferedReader().readText()
        check("/*__FEATURES__*/" !in script) { "Unresolved feature selection placeholder" }
        check("const features = {picker:" in script)
        val hash = MessageDigest.getInstance("SHA-256")
        zip.getInputStream(zip.getEntry("assets/index.android.bundle")).use { stream ->
            val buffer = ByteArray(65536)
            var size = stream.read(buffer)
            while (size >= 0) { hash.update(buffer, 0, size); size = stream.read(buffer) }
        }
        check(hash.digest().joinToString("") { "%02x".format(it) } ==
            "834bb2c88a7d8e508039e11be90a2a09f9f87017fdceef1999cf099933a6be35")
    }
    val dex = DexFileFactory.loadDexContainer(apk, Opcodes.getDefault())
    val instances = dex.dexEntryNames.flatMap { name ->
        dex.getEntry(name)!!.dexFile.classes.filter { it.type == "Lcom/facebook/react/runtime/ReactInstance;" }
    }
    check(instances.size == 1) { "Expected one ReactInstance definition, got ${instances.size}" }
    val owner = instances.single()
    val method = owner.methods.single { it.name == "loadJSBundle" }
    val implementation = method.implementation!!
    val instructions = implementation.instructions.toList()
    check(implementation.registerCount == 4)
    for (instruction in instructions) {
        val registers = when (instruction) {
            is FiveRegisterInstruction -> listOf(instruction.registerC, instruction.registerD,
                instruction.registerE, instruction.registerF, instruction.registerG).take(instruction.registerCount)
            is ThreeRegisterInstruction -> listOf(instruction.registerA, instruction.registerB, instruction.registerC)
            is TwoRegisterInstruction -> listOf(instruction.registerA, instruction.registerB)
            is OneRegisterInstruction -> listOf(instruction.registerA)
            else -> emptyList()
        }
        check(registers.all { it < implementation.registerCount }) { "Out of range DEX register" }
    }
    val refs = instructions.mapNotNull { (it as? ReferenceInstruction)?.reference }
    val assets = refs.filterIsInstance<StringReference>().map { it.string }
    check("assets://venus/bootstrap.js" in assets && "assets://index.android.bundle" in assets)
    val calls = refs.filterIsInstance<MethodReference>().map { it.name }
    check(calls.count { it == "createAssetLoader" } == 1)
    check(calls.count { it == "loadJSBundleFromAssets" } == 1)
    check(calls.indexOf("loadJSBundleFromAssets") < calls.indexOf("loadScript"))
    val nativeLoader = owner.methods.single { it.name == "loadJSBundleFromAssets" }
    val bootstrapCall = instructions.single {
        ((it as? ReferenceInstruction)?.reference as? MethodReference)?.name == "loadJSBundleFromAssets"
    }
    val abiErrors = mutableListOf<String>()
    if (nativeLoader.accessFlags and 0x2 != 0 && bootstrapCall.opcode != Opcode.INVOKE_DIRECT)
        abiErrors.add("Private native asset loader must use invoke-direct, got ${bootstrapCall.opcode}")
    val allClasses = dex.dexEntryNames.flatMap { dex.getEntry(it)!!.dexFile.classes }.associateBy { it.type }
    fun resolve(reference: MethodReference, type: String = reference.definingClass, seen: MutableSet<String> = mutableSetOf()): Method? {
        if (!seen.add(type)) return null
        val definition = allClasses[type] ?: return null
        return definition.methods.firstOrNull {
            it.name == reference.name && it.parameterTypes == reference.parameterTypes && it.returnType == reference.returnType
        } ?: definition.superclass?.let { resolve(reference, it, seen) }
            ?: definition.interfaces.firstNotNullOfOrNull { resolve(reference, it, seen) }
    }
    // A successful D8 build does not prove that an obfuscated host supplies Kotlin helper ABIs.
    // Check real definitions (including inherited methods), not the compiler's stock stdlib.
    val extensionClasses = allClasses.values.filter { it.type.startsWith("Lapp/venus/extension/") }
    val references = extensionClasses.flatMap { definition -> definition.methods.flatMap { method ->
        method.implementation?.instructions?.mapNotNull { (it as? ReferenceInstruction)?.reference }?.toList() ?: emptyList()
    } }.distinct()
    fun resolveField(reference: FieldReference, type: String = reference.definingClass, seen: MutableSet<String> = mutableSetOf()): Field? {
        if (!seen.add(type)) return null
        val definition = allClasses[type] ?: return null
        return definition.fields.firstOrNull { it.name == reference.name && it.type == reference.type }
            ?: definition.superclass?.let { resolveField(reference, it, seen) }
            ?: definition.interfaces.firstNotNullOfOrNull { resolveField(reference, it, seen) }
    }
    fun isHost(type: String) = type.startsWith("Lkotlin/") || type.startsWith("Lapp/venus/") ||
        type.startsWith("Lcom/facebook/react/")
    for (reference in references) {
        when (reference) {
            is MethodReference -> if (isHost(reference.definingClass)) {
                val resolved = resolve(reference)
                if (resolved == null) abiErrors.add("Unresolved extension dependency: $reference")
                else if (!reference.definingClass.startsWith("Lapp/venus/") && resolved.accessFlags and 0x1 == 0)
                    abiErrors.add("Non-public host dependency: $reference")
            }
            is FieldReference -> if (isHost(reference.definingClass)) {
                val resolved = resolveField(reference)
                if (resolved == null) abiErrors.add("Unresolved extension field: $reference")
                else if (!reference.definingClass.startsWith("Lapp/venus/") && resolved.accessFlags and 0x1 == 0)
                    abiErrors.add("Non-public host field: $reference")
            }
            is TypeReference -> if (isHost(reference.type) && reference.type !in allClasses)
                abiErrors.add("Unresolved extension type: $reference")
        }
    }
    check(abiErrors.isEmpty()) { abiErrors.joinToString("\n") }
    val fileModules = dex.dexEntryNames.flatMap { name ->
        dex.getEntry(name)!!.dexFile.classes.filter { it.type == "Lcom/discord/file_manager/FileModule;" }
    }
    check(fileModules.size == 1) { "Expected one FileModule definition" }
    val bridge = fileModules.single().methods.single { it.name == "getSize" }
    val bridgeRefs = bridge.implementation!!.instructions.mapNotNull { (it as? ReferenceInstruction)?.reference }
    val bridgeInstructions = bridge.implementation!!.instructions.toList()
    val prefixGuard = bridgeInstructions.indexOfFirst {
        ((it as? ReferenceInstruction)?.reference as? MethodReference)?.let { ref ->
            ref.definingClass == "Ljava/lang/String;" && ref.name == "startsWith"
        } == true
    }
    val dispatchCall = bridgeInstructions.indexOfFirst {
        ((it as? ReferenceInstruction)?.reference as? MethodReference)?.definingClass == "Lapp/venus/extension/VoiceProcessor;"
    }
    check(prefixGuard >= 0 && prefixGuard < dispatchCall) { "Ordinary getSize calls must bypass extension linkage" }
    check(bridgeInstructions.subList(prefixGuard + 1, dispatchCall).any { it.opcode == Opcode.IF_EQZ })
    check(bridgeRefs.filterIsInstance<MethodReference>().any {
        it.definingClass == "Lapp/venus/extension/VoiceProcessor;" && it.name == "dispatch"
    }) { "Native conversion dispatch missing from getSize" }
    val processors = dex.dexEntryNames.flatMap { name ->
        dex.getEntry(name)!!.dexFile.classes.filter { it.type == "Lapp/venus/extension/VoiceProcessor;" }
    }
    check(processors.size == 1) { "Expected one native conversion extension" }
    check(processors.single().methods.any { it.name == "dispatch" })
    val promises = dex.dexEntryNames.sumOf { name ->
        dex.getEntry(name)!!.dexFile.classes.count { it.type == "Lcom/facebook/react/bridge/Promise;" }
    }
    check(promises == 1) { "Compile-only Promise stub leaked into the APK" }
    if (args.getOrNull(1) == "signed") {
        val verification = ApkVerifier.Builder(apk).setMinCheckedPlatformVersion(26).build().verify()
        check(verification.isVerified) { "APK signature invalid: ${verification.errors}" }
        println("APK signing certificate and signature verified")
    }
    println("PASS: private native invoke ABI, host extension method/field/type linkage, ordinary-size fast path, unique patched classes, valid loader registers, extension present, stubs excluded, unchanged Hermes asset")
}
