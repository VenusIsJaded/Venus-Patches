package app.venus.patches

import java.io.File
import java.security.MessageDigest
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Exact, inspected HBC98 functions. No eval, runtime hook, remote loader or settings dependency. */
internal object HbcPrivacy {
    const val ORIGINAL_SHA256 = "834bb2c88a7d8e508039e11be90a2a09f9f87017fdceef1999cf099933a6be35"
    data class Target(val id: Int, val name: String, val offset: Int, val size: Int,
                      val header: String, val sha256: String, val promise: Boolean, val expandedHeaderHash: String)
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
    fun stub(target: Target) = if (target.name == "shouldCollectMetrics") hex("96067606") else if (!target.promise)
        if (target.name == "startRecordingAnalyticsEvents") hex("93017601") else returnUndefined
    else
        if (target.name == "send") resolvedEmptyObject else resolvedPromise
    val returnUndefined = hex("93067606") // LoadConstUndefined r6; Ret r6.
    val analytics = listOf(
        Target(34827, "increment", 28601475, 94, "b4849d000080000000000020", "adfb792cf300ccc640b7935f33189e8ae04eecfec910b0ea299527f5c0fe726e", false, "93a23ceb0565d922bae216a867a465471198f81db93f165508933e954f9a67ae"),
        Target(34828, "distribution", 28601569, 112, "e0849d000080000000000020", "2848c7480b826046ded716ffb48a18b333d958cf7caa9cf0ed7a47a60db08607", false, "84962661a7552b716996d776ffd11ef0313cebcd6989e00e9fc4c0b2387a9a42"),
        Target(34829, "_flush", 28601681, 182, "0c859d000080000000000020", "a4c016269ddd6f239efaed873f9d798f319d2c4fa945f29177fd6abe3cae0c19", false, "496bdd8830153774638d2503db398ac368be40552cda976c22e4b73a0e71b0ec"),
        Target(23717, "track", 27360201, 286, "881796000080000000000020", "f3bcde3d0de830c797876a4c159d219be67ec5591ce86b8e05950c615a48c0f5", true, "2c2ea2b04c1ac2fc2c333d5fbea91647cce92746e4c3783f3d48a2bdaae3184e"),
        Target(74411, "track", 35824578, 539, "f404b8000080000000000020", "d7e7d70175aad0e9c856ef91da2e5fba7c27afcfedffaf6881cfc4039a3558ac", true, "1a23f81c8e9de474c77bcb680285e39f99789f55571d44dd4e68ae1ca0afac6f"),
        Target(74415, "drainEventsQueue", 35825269, 248, "a005b8000080000000000020", "eb78e2c3240a3b21ac04058ab25ae5fb5ce65a51103525471025121b568dbcc0", true, "c382b4fd7abd53dbd1f1c89779a2b23f760a527845b61bfd673d8a914fa34478"),
        Target(74416, "submitEventsImmediately", 35825517, 250, "cc05b8000080000000000020", "28121d48b838dd6d82d1388b1c9bf306ddd30f2893bcc54cb862187c1653d5a0", true, "f97c6bb164d8745bfabc4a00576d827f154578a9fd46e6c90025b2e185662817"),
        Target(74417, "flushQueuedEvents", 35825767, 267, "f805b8000080000000000020", "67f486bfaaaf7b8e96066335b50ad822d4b13a133a01f5f30db0be1f2c28394c", true, "2e9f8317ef2319ade9219804771613de7a5008b37703e2352a6440fae6dbc24d"),
        Target(74418, "sendTelemetryEvent", 35826034, 347, "2406b8000080000000000020", "73f758dcb983fa1d5295a4166e5d1f071a4a1b282a26d1bee26d4402628639cd", true, "ede68b2741b3d72db65465394a5336054ab311d53c789e436663f3695ede8fa8"),
        Target(74414, "scheduleDrain", 35825117, 152, "7405b8000080000000000020", "38a224f1cf453931ba1bb7ae1cb63be8811f0451489d65ab07504a23dfde9e2a", false, "d910561e16b510c29704c5444452e670c266be228dffdd8e2bd665fedb8752ff"),
        Target(23720, "startRecordingAnalyticsEvents", 27360523, 13, "081896000080000000000020", "645fedb3791434b0327d0906ba36e9092b6011627c08db439b28a0b7415f2037", false, "924c7fa588f7a6733749c51ab3819b547e6dcc149214faa8d1349fb81bcf336d"),
    )
    val telemetry = listOf(
        Target(27143, "shouldCollectMetrics", 27822266, 86, "1c5e98000080000000000020", "9c07918de406fdf965ec7f1556825b4bfa37579fea01f4cfa0d16fdad2585f10", false, "6891ba51843747d6aafd4c01d59f375e73124252ae9c7587bd59469feab2485f"),
        Target(70332, "installWebsocketTelemetryHook", 35347148, 182, "a85fb5000080000000000020", "b40230a66a30a06cc0285871ad4e934e43eee815d457d90c546677ac550d1a3d", false, "d435f43ac670480c64d2a9896797d09b2b2260fa441137fe78edef84682c2c99"),
        Target(25707, "append", 27690542, 88, "586d97000080000000000020", "d83a5759dda5f8600b48bc1e4f3fe1171e7c117b316b73c01f8b9025e4e11a64", false, "8f6c7a720557a8c73cca2890e7c43fbbad707ad45158a475d9dea1fbb83d5940"),
        Target(25710, "append", 27690692, 52, "dc6d97000080000000000020", "21c71653ef9574b8cf70919c10cc3199f7a083309cba41e624950d53ad4f3e32", false, "aa3569e76ed5a688fde1ea6295437d7558c49b19058d60ea47daf1197c2f8d23"),
    )
    val crash = listOf(
        Target(72602, "send", 35620719, 179, "68dab6000080000000000020", "60327e72c5d089bfa4bdd98fb6384bd49bcdb6942684cc89a39329fbf2c27046", true, "4562ff1b5354806e17072b53de52cfbb19e029b06896562d58941ed337087076"),
        Target(96638, "send", 37694662, 181, "5080c6000080000000000020", "ed63e6c043d5280a56878a3c5b940405fe852aafbc890502b92abc124a3f7582", true, "288cd9b94de5e04bd473dc6923916cacd290f6a05d7ef9204699e682f0cc65a8"),
    )

    fun rewrite(bytes: ByteArray, targets: List<Target>): ByteArray {
        require(bytes.size >= 148) { "Truncated Hermes asset" }
        val header = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        require(header.getInt(8) == 98 && header.getInt(32) == bytes.size) { "Invalid HBC98 file header" }
        val inputFooter = MessageDigest.getInstance("SHA-1").apply { update(bytes, 0, bytes.size - 20) }.digest()
        require(inputFooter.contentEquals(bytes.copyOfRange(bytes.size - 20, bytes.size))) { "Invalid HBC footer" }
        // Validate all targets before changing anything; allow previously selected *other* privacy groups.
        for (target in targets) {
            require(bytes.copyOfRange(128 + target.id * 12, 140 + target.id * 12)
                .contentEquals(hex(target.header))) { "HBC header changed: ${target.name} #${target.id}" }
            val small = 128 + target.id * 12
            val expanded = (((header.getInt(small + 4) ushr 14) and 255) shl 24) or (header.getInt(small) and 0x1ffffff)
            require(digest(bytes.copyOfRange(expanded, expanded + 40)) == target.expandedHeaderHash) {
                "HBC expanded header changed: ${target.name} #${target.id}"
            }
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
