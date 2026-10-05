package app.venus.patches

import java.io.File
import java.security.MessageDigest

/** Exact, inspected HBC98 functions. No eval, runtime hook, remote loader or settings dependency. */
internal object HbcPrivacy {
    const val ORIGINAL_SHA256 = "834bb2c88a7d8e508039e11be90a2a09f9f87017fdceef1999cf099933a6be35"
    data class Target(val id: Int, val name: String, val offset: Int, val size: Int,
                      val header: String, val sha256: String, val promise: Boolean)
    fun digest(bytes: ByteArray, algorithm: String = "SHA-256") =
        MessageDigest.getInstance(algorithm).digest(bytes).joinToString("") { "%02x".format(it) }
    fun hex(value: String) = value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    fun verifyOriginal(bytes: ByteArray) {
        require(digest(bytes) == ORIGINAL_SHA256) {
            "Unsupported Discord JavaScript bundle; use the original 347.12 - Stable APKM"
        }
    }

    // HBC98: GetGlobalObject r6; TryGetById r7,r6,cache0,Promise;
    // GetByIdShort r8,r7,cache1,resolve; Call1 r6,r8,r7; Ret r6.
    // r6+ are GC-visible pointer-capable registers in all inspected Promise targets;
    // r0..r5 can be reserved number/non-pointer registers in Hermes V1.
    // Keep the Promise contract of track()/drain()/send(); do not return undefined to .then() callers.
    val resolvedPromise = hex("3d0648070600260044080701d26c0608077606")
    // Match Sentry's own empty-envelope branch: Promise.resolve({}), not an undefined response.
    val resolvedEmptyObject = hex("3d0648070600260044080701d209096e060807097606")
    fun stub(target: Target) = if (!target.promise)
        if (target.name == "startRecordingAnalyticsEvents") hex("93017601") else returnUndefined
    else
        if (target.name == "send") resolvedEmptyObject else resolvedPromise
    val returnUndefined = hex("93067606") // LoadConstUndefined r6; Ret r6.
    val analytics = listOf(
        Target(23717, "track", 27360201, 286, "881796000080000000000020", "f3bcde3d0de830c797876a4c159d219be67ec5591ce86b8e05950c615a48c0f5", true),
        Target(74411, "track", 35824578, 539, "f404b8000080000000000020", "d7e7d70175aad0e9c856ef91da2e5fba7c27afcfedffaf6881cfc4039a3558ac", true),
        Target(74415, "drainEventsQueue", 35825269, 248, "a005b8000080000000000020", "eb78e2c3240a3b21ac04058ab25ae5fb5ce65a51103525471025121b568dbcc0", true),
        Target(74416, "submitEventsImmediately", 35825517, 250, "cc05b8000080000000000020", "28121d48b838dd6d82d1388b1c9bf306ddd30f2893bcc54cb862187c1653d5a0", true),
        Target(74417, "flushQueuedEvents", 35825767, 267, "f805b8000080000000000020", "67f486bfaaaf7b8e96066335b50ad822d4b13a133a01f5f30db0be1f2c28394c", true),
        Target(74418, "sendTelemetryEvent", 35826034, 347, "2406b8000080000000000020", "73f758dcb983fa1d5295a4166e5d1f071a4a1b282a26d1bee26d4402628639cd", true),
        Target(74414, "scheduleDrain", 35825117, 152, "7405b8000080000000000020", "38a224f1cf453931ba1bb7ae1cb63be8811f0451489d65ab07504a23dfde9e2a", false),
        Target(23720, "startRecordingAnalyticsEvents", 27360523, 13, "081896000080000000000020", "645fedb3791434b0327d0906ba36e9092b6011627c08db439b28a0b7415f2037", false),
    )
    val telemetry = listOf(
        Target(25707, "append", 27690542, 88, "586d97000080000000000020", "d83a5759dda5f8600b48bc1e4f3fe1171e7c117b316b73c01f8b9025e4e11a64", false),
        Target(25710, "append", 27690692, 52, "dc6d97000080000000000020", "21c71653ef9574b8cf70919c10cc3199f7a083309cba41e624950d53ad4f3e32", false),
    )
    val crash = listOf(
        Target(72602, "send", 35620719, 179, "68dab6000080000000000020", "60327e72c5d089bfa4bdd98fb6384bd49bcdb6942684cc89a39329fbf2c27046", true),
        Target(96638, "send", 37694662, 181, "5080c6000080000000000020", "ed63e6c043d5280a56878a3c5b940405fe852aafbc890502b92abc124a3f7582", true),
    )

    fun rewrite(bytes: ByteArray, targets: List<Target>): ByteArray {
        // Validate all targets before changing anything; allow previously selected *other* privacy groups.
        for (target in targets) {
            require(bytes.copyOfRange(128 + target.id * 12, 140 + target.id * 12)
                .contentEquals(hex(target.header))) { "HBC header changed: ${target.name} #${target.id}" }
            require(digest(bytes.copyOfRange(target.offset, target.offset + target.size)) == target.sha256) {
                "HBC body changed: ${target.name} #${target.id}"
            }
        }
        val result = bytes.copyOf()
        for (target in targets) {
            val stub = stub(target)
            require(stub.size <= target.size)
            // Unreachable (opcode 0) padding removes the old body and leaves valid instruction boundaries.
            result.fill(0, target.offset, target.offset + target.size)
            stub.copyInto(result, target.offset)
        }
        // Same length/tables/debug maps; only selected function bodies and the mandatory footer change.
        val footer = MessageDigest.getInstance("SHA-1").apply { update(result, 0, result.size - 20) }.digest()
        footer.copyInto(result, result.size - 20)
        return result
    }
    fun apply(file: File, targets: List<Target>) { file.writeBytes(rewrite(file.readBytes(), targets)) }
}
