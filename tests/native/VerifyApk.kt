import com.android.apksig.ApkVerifier
import com.android.tools.smali.dexlib2.DexFileFactory
import com.android.tools.smali.dexlib2.Opcodes
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
    check(owner.methods.any { it.name == "loadJSBundleFromAssets" })
    val fileModules = dex.dexEntryNames.flatMap { name ->
        dex.getEntry(name)!!.dexFile.classes.filter { it.type == "Lcom/discord/file_manager/FileModule;" }
    }
    check(fileModules.size == 1) { "Expected one FileModule definition" }
    val bridge = fileModules.single().methods.single { it.name == "getSize" }
    val bridgeRefs = bridge.implementation!!.instructions.mapNotNull { (it as? ReferenceInstruction)?.reference }
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
    println("PASS: unique patched classes, valid loader registers, guarded native bridge, extension present, stubs excluded, unchanged Hermes asset")
}
