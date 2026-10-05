package app.venus.patches

import app.morphe.patcher.util.proxy.mutableTypes.MutableMethod
import com.android.tools.smali.dexlib2.DexFileFactory
import com.android.tools.smali.dexlib2.Opcodes
import com.android.tools.smali.dexlib2.Opcode
import com.android.tools.smali.dexlib2.iface.instruction.*
import com.android.tools.smali.dexlib2.iface.reference.MethodReference
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.ZipFile

/** Detached method assembly and in-memory HBC fixtures only. Never runs Patcher or writes an APK. */
fun main(args: Array<String>) {
    val groups = listOf(HbcPrivacy.analytics, HbcPrivacy.telemetry, HbcPrivacy.crash)
    val natives = NativePrivacy.crash + NativePrivacy.telemetry + NativePrivacy.attribution
    check(natives.size == 61 && natives.distinct().size == natives.size)
    check(groups.flatten().size == 12 && groups.flatten().map { it.offset }.distinct().size == 12)
    check(HbcPrivacy.resolvedPromise.last() == 6.toByte())
    check(HbcPrivacy.resolvedEmptyObject.size == 22)
    check(HbcPrivacy.returnUndefined.contentEquals(byteArrayOf(147.toByte(), 6, 118, 6)))
    if (args.isEmpty()) {
        // CI can validate output against the same digests without distributing proprietary APK content.
        println("PASS: privacy target/stub definitions; set VENUS_ORIGINAL_APK for read-only APK ABI validation")
        return
    }
    val apk = File(args[0])
    val original = ZipFile(apk).use { zip -> zip.getInputStream(zip.getEntry("assets/index.android.bundle")).readBytes() }
    HbcPrivacy.verifyOriginal(original)
    val header = ByteBuffer.wrap(original).order(ByteOrder.LITTLE_ENDIAN)
    for (target in groups.flatten()) {
        val small = 128 + target.id * 12
        check(original[small + 11].toInt() and 32 != 0)
        val large = (((header.getInt(small + 4) ushr 14) and 255) shl 24) or (header.getInt(small) and 0x1ffffff)
        check(header.getInt(large) == target.offset && header.getInt(large + 12) == target.size)
        check(original[large + 36].toInt() and 0xc8 == 0) // Normal, no exception handler.
        val firstPointerRegister = header.getInt(large + 20) + header.getInt(large + 24)
        val lowestUsedRegister = if (target.name == "startRecordingAnalyticsEvents") 1 else 6
        check(firstPointerRegister <= lowestUsedRegister) { "Stub uses a non-GC-visible register" }
        check(header.getInt(large + 28) >= if (target.name == "send") 10 else if (target.promise) 9 else lowestUsedRegister + 1)
        if (target.promise) check(original[large + 32].toInt() and 255 >= 2)
    }
    for (selection in 1..7) {
        var changed = original
        val targets = groups.filterIndexed { i, _ -> selection and (1 shl i) != 0 }.flatten()
        for ((i, group) in groups.withIndex()) if (selection and (1 shl i) != 0) changed = HbcPrivacy.rewrite(changed, group)
        check(changed.contentEquals(HbcPrivacy.rewrite(original, targets))) // Selection order independence.
        check(changed.size == original.size)
        check(HbcPrivacy.digest(changed.copyOf(changed.size - 20), "SHA-1") ==
            changed.takeLast(20).joinToString("") { "%02x".format(it) })
        val restored = changed.copyOf()
        for (target in targets) {
            val stub = HbcPrivacy.stub(target)
            check(changed.copyOfRange(target.offset, target.offset + stub.size).contentEquals(stub))
            check(changed.copyOfRange(target.offset + stub.size, target.offset + target.size).all { it == 0.toByte() })
            original.copyInto(restored, target.offset, target.offset, target.offset + target.size)
        }
        original.copyInto(restored, restored.size - 20, original.size - 20)
        check(restored.contentEquals(original)) { "Unrelated HBC bytes changed" }
    }
    val corrupt = original.copyOf().apply { this[HbcPrivacy.analytics.first().offset] = 0 }
    check(runCatching { HbcPrivacy.verifyOriginal(corrupt) }.isFailure)
    val before = corrupt.copyOf()
    check(runCatching { HbcPrivacy.rewrite(corrupt, HbcPrivacy.analytics) }.isFailure)
    check(corrupt.contentEquals(before)) // Validate the entire plan before mutation.
    val dex = DexFileFactory.loadDexContainer(apk, Opcodes.getDefault())
    val methods = dex.dexEntryNames.flatMap { dex.getEntry(it)!!.dexFile.classes.flatMap { it.methods } }
    for (target in natives) {
        val originalMethod = methods.single { target.matches(it) }
        check(originalMethod.name != "<init>" && originalMethod.name != "<clinit>")
        val fixture = MutableMethod(originalMethod)
        target.install(fixture) // Detached assembler fixture, not a Patcher invocation.
        val instructions = fixture.implementation!!.instructions
        check(fixture.implementation!!.registerCount == originalMethod.implementation!!.registerCount)
        val firstReturn = instructions.indexOfFirst { it.opcode in listOf(Opcode.RETURN_VOID, Opcode.RETURN, Opcode.RETURN_OBJECT) }
        check(firstReturn in 0..5)
        val prefix = instructions.take(firstReturn + 1)
        for (instruction in prefix) {
            val regs = when (instruction) {
                is FiveRegisterInstruction -> listOf(instruction.registerC, instruction.registerD,
                    instruction.registerE, instruction.registerF, instruction.registerG).take(instruction.registerCount)
                is ThreeRegisterInstruction -> listOf(instruction.registerA, instruction.registerB, instruction.registerC)
                is TwoRegisterInstruction -> listOf(instruction.registerA, instruction.registerB)
                is OneRegisterInstruction -> listOf(instruction.registerA)
                else -> emptyList()
            }
            check(regs.all { it in 0 until fixture.implementation!!.registerCount })
        }
        val calls = prefix.mapNotNull { ((it as? ReferenceInstruction)?.reference as? MethodReference) }
        if (target.result.name.startsWith("PROMISE")) {
            check(calls.single().definingClass == "Lcom/facebook/react/bridge/Promise;" && calls.single().name == "resolve")
            val move = prefix.first() as TwoRegisterInstruction
            check(move.registerB == originalMethod.implementation!!.registerCount - 1)
        } else if (target.result == NativePrivacy.Result.AF_SUCCESS) {
            check(calls.single().name == "onSuccess" && prefix.any { it.opcode == Opcode.IF_EQZ })
        } else check(calls.isEmpty())
    }
    println("PASS: 12 pinned HBC targets, all 7 HBC selection combinations, valid footers, unchanged unrelated bytes, rejection of changed inputs, 61 exact native ABIs and assembled register-safe early-return/Promise/callback guards; no APK patched")
}
