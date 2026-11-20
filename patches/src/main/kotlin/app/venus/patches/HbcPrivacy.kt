package app.venus.patches

import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Exact, inspected HBC98 functions. No eval, runtime hook, remote loader or settings dependency. */
internal object HbcPrivacy {
    const val ORIGINAL_SHA256 = "7d5e9fd331035f6c6fa354c5a7bbe83b546ed8b466aadd2a9bc4d7ec7958ed77"
    data class Target(val id: Int, val name: String, val offset: Int, val size: Int,
                      val header: String, val sha256: String, val promise: Boolean, val expandedHeaderHash: String)
    private fun toHex(bytes: ByteArray): String {
        val hex = "0123456789abcdef"
        val out = CharArray(bytes.size * 2)
        for (i in 0 until bytes.size) {
            val v = bytes[i].toInt() and 255
            out[i * 2] = hex[v ushr 4]
            out[i * 2 + 1] = hex[v and 15]
        }
        return String(out)
    }
    fun digest(bytes: ByteArray, algorithm: String = "SHA-256") =
        toHex(MessageDigest.getInstance(algorithm).digest(bytes))
    fun hex(value: String): ByteArray {
        val len = value.length / 2
        val out = ByteArray(len)
        for (i in 0 until len) {
            val hi = Character.digit(value[i * 2], 16)
            val lo = Character.digit(value[i * 2 + 1], 16)
            out[i] = ((hi shl 4) or lo).toByte()
        }
        return out
    }
    fun verifyOriginal(bytes: ByteArray) {
        require(digest(bytes) == ORIGINAL_SHA256) {
            "Unsupported Discord JavaScript bundle; use the original 354.12 - Stable APKM"
        }
    }
    /** Same check, streamed: never holds the 55 MB bundle in memory on the patching device. */
    fun verifyOriginal(file: File) {
        require(streamDigest(file, "SHA-256", file.length()) == ORIGINAL_SHA256) {
            "Unsupported Discord JavaScript bundle; use the original 354.12 - Stable APKM"
        }
    }
    private fun streamDigest(file: File, algorithm: String, length: Long): String =
        toHex(streamDigestBytes(file, algorithm, length))
    private fun streamDigestBytes(file: File, algorithm: String, length: Long): ByteArray {
        val digest = MessageDigest.getInstance(algorithm)
        file.inputStream().use { input ->
            val buffer = ByteArray(1 shl 20)
            var left = length
            while (left > 0) {
                val read = input.read(buffer, 0, minOf(buffer.size.toLong(), left).toInt())
                if (read < 0) break
                digest.update(buffer, 0, read)
                left -= read
            }
        }
        return digest.digest()
    }

    // HBC98 opcodes (Hermes 250829098 BytecodeList.def) and the pinned bundle's string IDs.
    const val OP_NEW_OBJECT = 4; const val OP_GET_GLOBAL = 61; const val OP_GET_BY_ID = 69; const val OP_TRY_GET_BY_ID = 72
    const val OP_CALL1 = 108; const val OP_CALL2 = 110; const val OP_RET = 118
    const val OP_LOAD_PARAM = 137; const val OP_LOAD_CONST_STRING = 144; const val OP_LOAD_UNDEFINED = 147; const val OP_LOAD_FALSE = 150
    /** String table IDs of "Promise", "resolve" and "" in the pinned 354.12 bundle. */
    const val PROMISE_ID = 36; const val RESOLVE_ID = 209; const val EMPTY_STRING_ID = 255
    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }
    // GetGlobalObject r6; TryGetById r7,r6,cache0,Promise; GetById r8,r7,cache1,resolve; Call1 r6,r8,r7; Ret r6.
    // r6+ are GC-visible pointer-capable registers in all inspected Promise targets;
    // r0..r5 can be reserved number/non-pointer registers in Hermes V1.
    // Keep the Promise contract of track()/drain()/send(); do not return undefined to .then() callers.
    val resolvedPromise = bytes(OP_GET_GLOBAL, 6, OP_TRY_GET_BY_ID, 7, 6, 0, PROMISE_ID and 255, PROMISE_ID ushr 8,
        OP_GET_BY_ID, 8, 7, 1, RESOLVE_ID and 255, RESOLVE_ID ushr 8, OP_CALL1, 6, 8, 7, OP_RET, 6)
    // Match Sentry's own empty-envelope branch: Promise.resolve({}), not an undefined response.
    // NewObject is opcode 4. 1.3.6 and earlier wrote 9 (NewFastArray), which made the rest of the stub misdecode.
    val resolvedEmptyObject = bytes(OP_GET_GLOBAL, 6, OP_TRY_GET_BY_ID, 7, 6, 0, PROMISE_ID and 255, PROMISE_ID ushr 8,
        OP_GET_BY_ID, 8, 7, 1, RESOLVE_ID and 255, RESOLVE_ID ushr 8, OP_NEW_OBJECT, 9, OP_CALL2, 6, 8, 7, 9, OP_RET, 6)
    val returnFalse = bytes(OP_LOAD_FALSE, 6, OP_RET, 6)
    val returnEmptyObject = bytes(OP_NEW_OBJECT, 6, OP_RET, 6)
    val returnEmptyString = bytes(OP_LOAD_CONST_STRING, 6, EMPTY_STRING_ID and 255, EMPTY_STRING_ID ushr 8, OP_RET, 6)
    // LoadConstUndefined r6; LoadParam r7, 2; Call1 r6, r7, r6; Ret r6 (invokes callback parameter directly).
    val callParam2 = bytes(OP_LOAD_UNDEFINED, 6, OP_LOAD_PARAM, 7, 2, OP_CALL1, 6, 7, 6, OP_RET, 6)
    val returnUndefined = bytes(OP_LOAD_UNDEFINED, 6, OP_RET, 6) // LoadConstUndefined r6; Ret r6.
    private val falseTargets = setOf("shouldCollectMetrics", "isTracing", "shouldRun", "isZoomedExperimentEnabled",
        "isJankScreenReportingEnabled", "isNavigationTTIEnabled", "recordComponentSpan",
        "isClickstreamEnabled", "clickstreamExperimentEnabled")
    private val emptyObjectTargets = setOf("expandEventProperties", "getLocation", "getReadyPayloadByteSizeAnalytics")
    private val emptyStringTargets = setOf("captureException", "captureCrash")
    fun stub(target: Target) = when {
        target.name in falseTargets -> returnFalse
        target.name in emptyObjectTargets -> returnEmptyObject
        target.name in emptyStringTargets -> returnEmptyString
        target.name == "timeRequire" -> callParam2
        !target.promise -> when (target.name) {
            "startRecordingAnalyticsEvents" -> bytes(OP_LOAD_UNDEFINED, 1, OP_RET, 1)
            "trackCrash" -> bytes(OP_LOAD_UNDEFINED, 8, OP_RET, 8)
            "recordLateComponentLayout" -> bytes(OP_LOAD_FALSE, 7, OP_RET, 7)
            else -> returnUndefined
        }
        target.name == "send" -> resolvedEmptyObject
        else -> resolvedPromise
    }
    // Hermes shares one body between functions with identical bytecode. Every target here owns its body:
    // trackAppUIViewed2 shared createThread_'s (forum posts, #93), trackHeartbeat shared poll-vote and
    // stage-join code, and the module-2 Set.add and Date.now() closures shared other modules' helpers.
    val analytics = listOf(
        Target(38505, "increment", 30767207, 94, "f0b3c8000080000000000020", "6ab0d1c093e7d90fb6199de40024e2215c59d567d2c4b4d8d83d43fd8a08622d", false, "5e61f1df348af84931b111e38bb15bfefab42c2345c0934e58cc9be66a6d0bda"),
        Target(38506, "distribution", 30767301, 112, "18b4c8000080000000000020", "56447f60e15ef805842d6f9cb6ed351f96bf6cfc37a5539a59ebb9cae1ece0a0", false, "5fab88f04c5ce48d3ca81a3fbd49f9a11a0f5297ce75777f71bab7ffebfd1c1c"),
        Target(38507, "_flush", 30767413, 182, "40b4c8000080000000000020", "91ffef0d2b67f68a3c300c7d8b1b2c89eef9b7b44605b902702c457e95dc0dc6", false, "94446c69361e8d67e5992c3f0acfa2675f52b5dd85585e17eddf3040d85d7492"),
        Target(25982, "track", 29310957, 286, "ed3fbf071e413b10170e0006", "7bd3be35a24c0e21c1b5c9a6d093df85944afd364eeed67776802fda544114e1", true, ""),
        Target(82495, "track", 39168728, 539, "a8b0e2000080000000000020", "1bb32c62fa87d79b9bb70258d95d9fd51bee2caa451432a1ae902b526163f97f", true, "d3649222562a41ef0d7d08d43555ceb62f4a4a87e37d933d551d2db67bde0713"),
        Target(82499, "drainEventsQueue", 39169419, 248, "48b1e2000080000000000020", "5e841271367992a35f212e4c89980ac3da068262483147f288697d5db07cc727", true, "c9335d55915caf5d8c5081c3b402f389b7835eadc78eec609f9987e5a8fc251a"),
        Target(82500, "submitEventsImmediately", 39169667, 250, "70b1e2000080000000000020", "f40babac2c4c7be3bc9aaf6a8911fcb1bba7d40f10b40391da57de6c27eab334", true, "bc735c832845a0172bb048bd54d224273a1801333a3907c9f11a07463801051c"),
        Target(82501, "flushQueuedEvents", 39169917, 267, "98b1e2000080000000000020", "acbb810b26e3649210ae4d252d49229e5026f9c00533233b69667c3f56aa2e57", true, "1702dedd4009a714e1eb61455ff8e710311197262f42fdc83b219dfe8acd7c3b"),
        Target(82502, "sendTelemetryEvent", 39170184, 347, "c0b1e2000080000000000020", "297c4b83999942efc28500ea4d9adc97e2038694d2f9529660dc34f3c73bb0f4", true, "5f915e1953965676c4077414bec3f1f8b05aa52f67f12dcd7c844bd50272ca62"),
        Target(82498, "scheduleDrain", 39169267, 152, "20b1e2000080000000000020", "cb6ab3379bf6e5df3e852a6d67dc649a917964a285c483eb2e72e71877d88d12", false, "9234a9dc7a611be4a13a8995ac20028b34a740ec3d02c3b0fb995efcd9a74289"),
        Target(25985, "startRecordingAnalyticsEvents", 29311279, 13, "54dfc1000080000000000020", "645fedb3791434b0327d0906ba36e9092b6011627c08db439b28a0b7415f2037", false, "dbbc2e33047e15883cb943b3beed3e63bc64ebc3846f8c7aebac22bccb6e8705"),
        Target(25917, "addBreadcrumb", 29309192, 84, "2cd5c1000080000000000020", "36b43ea9c6b0a21dddb098486d3df98c55e8ff1ca9e7c686a98723c1f616b3c5", false, "227e1577058711f432f405a42720df0297eb22f7ab8a1fe2704fffe8f27b1774"),
        Target(25918, "expandEventProperties", 29309276, 714, "54d5c1000080000000000020", "c3a5a8cf040eb7ea62f20c5e738280f32003de77bc8b5091a81be7c33a6e43bc", false, "50936a97c6b9c9d7fe80e7762cad22f04b4259a6328706ff6dc5c4c6b6137215"),
        Target(25919, "debugLogEvent", 29309990, 79, "7cd5c1000080000000000020", "ae373716c0012fe9667ffda12a0952cf82fc8a387c20723166b2fef1483dbe69", false, "a86302afae94fb0c171a6b42117d75786fce1226535ef3a9ee780364b4f1a18c"),
        Target(25990, "trackNetworkAction", 29311386, 135, "1ce0c1000080000000000020", "933079d9a66f97f51c3297c16bfa9152e04fde5d876f1236481fdb6f2ebc4607", false, "6cf5879dfa2fc165c4dd1a5356a28efdc9f0e363154910ac0d5a69c345c602ab"),
        Target(25993, "setCurrentImpression", 29311555, 52, "6ce0c1000080000000000020", "383755980a6759325bdf8395b11322a998f7832c5fc8ce246050ea1806a79765", false, "4505a0d5528d2069294d54a6cbbded92693736a5ebfd55918b29ae61b8c25bbe"),
        Target(25994, "cleanupImpression", 29311607, 52, "94e0c1000080000000000020", "d335713e5baa9008e29b06873bd4f97822a229d941452e6cc258f53d607246b5", false, "36ef15ec6d9d0c5efdad3e4f494b6e20934fb8a20938bf7d9df378a60e04e011"),
        Target(25995, "setDebugTrackedData", 29311659, 59, "bce0c1000080000000000020", "0cb0743fd806dc6647457039ba7447ce5ff218813fb69acba27e854e336fe7be", false, "f987fdec846dc81f385a1151401373eda796ad528795fdd2a9fd5686ea2d0361"),
        Target(25996, "getLocation", 29311718, 51, "e4e0c1000080000000000020", "13353509aa05c8736d803e71e596c2455d30762bb271150dd1ce6e173ce90f95", false, "7c55103795928966163208c68a529b9f11cedb80c99a3e9c2be44b084104139b"),
        Target(43713, "_trackHeartbeat", 31428508, 61, "3cbecb000080000000000020", "31a14a6334918f15b99e2c8704c4ea7a31e1fc4fe2430713874cb96a943cb6d8", false, "a42728250836b00ed8efaaf86c299e38a9c48b851557bc26aa7480ff3566d75a"),
        Target(43733, "isClickstreamEnabled", 31430728, 115, "5cc1cb000080000000000020", "cf591d430de97148e7c72331b9c2e23b0e6472d207e185ce9fac9d1f1a30bf5d", false, "c86456d7e26ebe1587c2a41976549cff30b212cb537461afeae90416b296d67b"),
        Target(43736, "clickstreamExperimentEnabled", 31431239, 35, "e4c1cb000080000000000020", "12897ef5139397dba8acd87ebfa334dfc3d8b84caefc11b35e880aa4ecfd8644", false, "e6fb258fe8a5fc18b60d74aa41bf3a546ebd4d6a576dafc1d9b29748ec39661d"),
        Target(37968, "trackImpression", 30681690, 397, "a063c8000080000000000020", "83320f05884ee97c506d7e4de38b9ed08cedd2f04af3481f8be688ef6585a58f", false, "528720108fcb6c55eb1594e91ff5e7326976733ee562bf02ffd73579a5cfcfec"),
        Target(37969, "useTrackImpression", 30682087, 131, "c863c8000080000000000020", "bd6ad4d0f0cfae9c824ed127f27ddce9729b5f856beff39e9a3261ae54a96109", false, "57708d288e1eb22754dc24ffa51845961bb7b3935883341b3d8d95cd3c003c3c"),
        Target(63258, "trackSearchOpened", 34985193, 206, "38fcd6000080000000000020", "39507609dfefdc08c3c3f985bb6d9d1a9c79962010a99ba0fe61ee66d2054b60", false, "28ef60cd81b53509a8ccecebdd87fbefc505c329e2654dd1955b987813071102"),
        Target(63259, "trackSearchStarted", 34985399, 324, "60fcd6000080000000000020", "26510f259e9c484e278cc07779960374126633c34190b92d921eac2b5dc58a49", false, "3216d1c890e73fd787e65840d8f1784f7ec6e12fa7783d9a1ea4452f5237060d"),
        Target(63260, "trackSearchResultClicked", 34985723, 431, "88fcd6000080000000000020", "8009f715b99831b838973ac65b4b30ff0595c71f17d02d1b238feae5941b7109", false, "dcbf81196c29621188a4e32d0c157644305afc06d7f828da09f24aed22679596"),
        Target(63261, "trackSearchResultReturned", 34986154, 431, "b0fcd6000080000000000020", "7929d3381c38fed90be03aba7297f27798f4a4dcfd40cd8c5f8598d178c83c76", false, "f4f0008e0b50139c7b8bbe9a178d059bb04d3c2db882f1c8068232f0cd147d24"),
        Target(63262, "trackSearchEmptyResult", 34986585, 302, "d8fcd6000080000000000020", "044b04973d1a9bcc9e8012418ed6380edcb6264e7a04fca5d3845aaad4c09203", false, "eda6a206cff293a5d11902b5d3f1b03cf4903ef6cde11d48a357bc35333cd21c"),
        Target(63263, "trackSearchEmptyMessageResult", 34986887, 302, "00fdd6000080000000000020", "f67c4aa3717e034cf1e63b6f3115686c05f4d70c73822321bfac200eb37abd2c", false, "34087c33fbc16a6695122562762651dcaa1041be9d8c7a58cb3d46a42c918eac"),
        Target(63264, "trackSearchClosed", 34987189, 73, "28fdd6000080000000000020", "8b05ba118098c6b155f57a6b50fa38596a48242135ada95936f1520b5c9071dd", false, "6fc13ce4a3adc18c8d69067add32d61501584df35752a2e311c2a3316c6cb705"),
        Target(63265, "trackSearchIndexing", 34987262, 181, "50fdd6000080000000000020", "11b64a221f02dd4454c69c5172d6b3f9236d55d12b3fdb993b08ac539614d69e", false, "a6ad62ab9790bb17e3bbfba5ce4c8557d7c997c03a5dd1deadbc630d1163398e"),
        Target(63266, "trackSearchHistoryClicked", 34987443, 194, "78fdd6000080000000000020", "0fcab2e2253f346c98a9a732ec4ac194e834cd8fab12adfa322229e4d777562a", false, "d132dca37f53d7368324a22ca2f81b81c6df9f0ea9446e5462f879917978b529"),
        Target(63267, "trackSuggestedSearchClicked", 34987637, 176, "a0fdd6000080000000000020", "dec20d8d9e25c9d56a42c1f179fcfb5dd735ca12625bc2b08b8eb96211259463", false, "4e4f68d2fcaa4644593dcc80ebb70b788bf1c9d0958a00bde95e676b68874045"),
        Target(63268, "trackSearchFilterAdd", 34987813, 298, "c8fdd6000080000000000020", "570d3c5c6d757ebc645bca7033e0cb958e5891e7689692e7b4f8183c3fe46397", false, "46d20b56e0a67315cc458f2de5a9e7fa1ec129dba0cf3cfe0158ee1f986b4a19"),
        Target(63269, "trackSearchFilterRemove", 34988111, 299, "f0fdd6000080000000000020", "b92937927e2e6e70cb142f3b26323b1bfab28e129b9033277ec2ec1cf937c7eb", false, "790a2f5a572227915fbbe591253680146ce28fd3c580149024028d5d8fb94497"),
        Target(63270, "trackSearchTabSelected", 34988410, 161, "18fed6000080000000000020", "af968a6914ad39ec447d3da8ccb181909193a19cb6e7749440d9fbac56bb6191", false, "073142563a1d2696b8d25a7ad06a5acda2e99bdc96dc8cda51e829e2215c43c8"),
        Target(66517, "logReadyPayloadReceived", 35885910, 509, "c0fcd8000080000000000020", "e06ea4559a3f9b4814dd55177d6f8da5cce380fc76c8d4c98c7f20dab60fb636", false, "903a4165b48836ca47aebce4f92d3601f52b514764cc4b572cf758fb8c2e3132"),
        Target(66519, "getReadyPayloadByteSizeAnalytics", 35886520, 892, "20fdd8000080000000000020", "f64e5b4fbca094a309f14ee97ce861834220b5da6c2321da0e57ac758ad3341e", false, "29742e02793457f9f39dd99e734552af056791f3e8dc640de2dd4deb3e11dcd6"),
        Target(66520, "logGatewayConnected", 35887412, 150, "48fdd8000080000000000020", "9c7ea9c6e1527a2febf7c7861b7bbd2a68a9dd482ffc2186bccb45036569df8e", false, "185409924c5dad0e2952e6cf9cf59a9d0d7f65ac68ccb36699b4217a7f0903d4"),
        Target(66522, "logResumeAnalytics", 35887629, 323, "98fdd8000080000000000020", "6e7a48ac14e37b3ef681157c12f745ab9f3b3d0f86a82c61e656572a66df68ae", false, "9c1a6067639ca76df3a205955b641eedb0c9cb296bef0a09ecb66b3c2f87afcf"),
        Target(75178, "componentDidMount", 37784139, 405, "cc4ade000080000000000020", "e0b1d3d6b6034b00a8db8d1c20596d7d1a1ad40d6d8165ee6106e8c073783ebf", false, "c053d26e2b2f7709175826b9c51efee15b395d953ca22c500157da6d9b337231"),
        Target(75179, "componentDidUpdate", 37784544, 1499, "f44ade000080000000000020", "4bf60de2de934fe0763442209de9313a8d7dbc21226d678839c5fdfa8c6faa51", false, "36a9d9149e6d0d2e60138122d8a0c4b14bd6ef7028914fba138e1715c002a124"),
        Target(75181, "_trackWithMetadata", 37786095, 163, "444bde000080000000000020", "21b691a955dfd92715af4454acf64d1fef893296dc9de74fb0a9c7a208f57ba4", false, "2f368612626f8e0c52b025c545fe48b670afad83bd884587ced556823c820a00"),
        Target(76539, "_initialize", 38270726, 103, "a41fdf000080000000000020", "7d93c9355aaa81e4b84fd058e75cb3318f5e455bcf98703a685ba97d06f675a5", false, "ac6dbef4edabcda628e9438c6f9a51f86f9041a906f5c29d169cb6402a3f08bf"),
        Target(76541, "_trackStartSpeaking", 38270884, 236, "f41fdf000080000000000020", "4adc9e78fcccf6af2c8d8d07c96e675b2006a5938e35f7f5aef246b21606401a", false, "fb4c70afdee50a6bbe41bd4e47cdd6bea305bbc33797559e7e8cab3f49ae1b39"),
        Target(76542, "_trackStartListening", 38271120, 235, "1c20df000080000000000020", "7d62bb81d41afb5bb8cba24b6fe21153214d5ce80a8a43d7c3aa6078f7e2125d", false, "820e8d97e261894eacceaf2fc1c82c92a6a166cbdb51dbfdee681f14b4d2f520"),
    )
    val telemetry = listOf(
        Target(33440, "shouldCollectMetrics", 30114333, 86, "8cc9c5000080000000000020", "61d6cd262408d477fc3e75f2783b48305a1ca31f7270a1ea3dda00da905ac5a6", false, "4563d86e11550a46539a0fa0a6ab8dd7ba8c8c5773977b267d8ae5c98c5e2045"),
        Target(78367, "installWebsocketTelemetryHook", 38677237, 181, "e43fe0000080000000000020", "7d90df1e08a15a47648e51b19417acf4f44f9de202a807baa5f0bbbe52235d12", false, "4b1ba6ca293be483c3d2f4d85970a6e62686fa64fd98009e7da078cf6c0cbc2d"),
        Target(28049, "append", 29654340, 88, "7cf0c2000080000000000020", "df8c65f5e49db48c0709db39750dcb0b50a1cfb72fcedfa1e2c2fe2c4edf433a", false, "ded845c0ed775f5fca935cf32d1725c8b47344b32f00d781d52c9819193997a2"),
        Target(28052, "append", 29654490, 52, "f4f0c2000080000000000020", "280535ae2e2a9f74089fb9f8798c0c5310e8345e743eeca8e2bbbf6ab427ca19", false, "9b0428563ca9e188fe4c7748cc890c846415ae3f32b6148c97a1526fb96f756b"),
        Target(20738, "isTracing", 28578221, 79, "ecf5be000080000000000020", "22e9920d33cb81962aa8ef58d51bf829f914f1a520c0c288a94f30901c001ba6", false, "b63fed5adbf5f5c502fcbf5957986ae185113d7aaadf3e4c931fbbfe3f4c2fff"),
        Target(25863, "_initialize", 29303576, 183, "58ccc1000080000000000020", "66b8b24f85bab8bd62a9269b58785d0b86ed991379cfcc13a6d1740d56731db3", false, "9dcfeaaa367f75e55dbf4f865ade658396beb50936acf13b7ec1e9322f59c1cc"),
        Target(28027, "shouldRun", 29653262, 34, "34edc2000080000000000020", "a1da1be6925edb7edd0c7a7d48cb26e5c438704b8de2297c0e66bf12f025f3b8", false, "a37ca6b10dba22cf6841ca165bdc68a87415a9e445f28704558c7b41ef2bc7c6"),
        Target(28032, "isZoomedExperimentEnabled", 29653379, 35, "fcedc2000080000000000020", "4506c457e08cd3373e7f88729febb2a78d495dc33393782d2d3d2f8e6cd2104f", false, "2e6a497db8b74037132b7b8f35aaf6c6d8324bf8f0202d3631ba58d1d517fa63"),
        Target(28038, "start", 29653640, 102, "887ac403660038080f050105", "afd1bd3f04a7636a10b2d0485ad232a4ea72dde3f9401633f311465a71088865", false, ""),
        Target(28044, "_kick", 29654037, 118, "b4efc2000080000000000020", "63b8edb8d587f981e8718a168b3c8d90a5be4b8c6c4357421a3abfe66484e8cc", true, "fa0f640e68d22a9e4ee8939b38f33cec03a331aac014d76294833dc440652337"),
        Target(43754, "_trackAppUIViewed", 31433192, 61, "b4c4cb000080000000000020", "f94eb886ace5653771b88cda0091d6f4d362aea9047c86d5215927569641078c", false, "80b55a3641babdd57935421c7aa8a29540fb6977f62f95fcc030936a95fdc2d1"),
        Target(43758, "trackAppOpened", 31433436, 185, "64c5cb000080000000000020", "9a3548075efc42a6480766945f21f9f45d426dda7ae2c56694d6435e0f50d2c2", false, "a47f08bbc5a0b6a241a403613dabcbccc85d1c948106a1a770cc61a9588c5c02"),
        Target(43759, "trackAppUIViewed", 31433621, 106, "8cc5cb000080000000000020", "af60ccc93fe312d626247c3ce2d14b6687e1a6a4422b2bf13cc905da0773dbfa", false, "96bdbc51041c65228ac712b3e147ae5b109ca03037fbea75dba41bc893eeeea4"),
        Target(43761, "trackAppLaunchCompleted", 31433727, 120, "dcc5cb000080000000000020", "981ee3b0e401d9e1cfd74a20ddee4de5a7f3f2362d04698e6ea203416b78e1d6", false, "9a2ce0138b921eb6be13f1999d7aa7117d612eb14e03211d4a8baff347c06528"),
        Target(43903, "timeRequire", 31445469, 274, "3cdbcb000080000000000020", "65bfbd0d0df501b9fcbc2c553be52bc602a8adba6208e6ba8bf69cf1d847137e", false, "21acece1d73dfe33812be9dd117366fae9613e3c7be622ef49eeb1253832f235"),
        Target(45147, "ttiRecorded", 31580852, 51, "709ccc000080000000000020", "e3d38bcf117b93d6ba034ee0b656df62c059b69d423bff8faaef172470e77484", false, "2ffd6a5f3ef791775ee1411e24b87a2a35c86d12a01dfdb2221a27d7c6c5ee9d"),
        Target(45151, "trackAndroidArtProfileSnapshot", 31581079, 44, "109dcc000080000000000020", "a1a13162651e58a172fd452544dd9524758f5da8587c276d516e90fa24d865b9", false, "4cc37614552daf015b999a359dfcc9ca6c1933a837e0939eb6eb43c9cc35413d"),
        Target(69651, "_initialize", 36399486, 30, "94e8da000080000000000020", "99da2a81ac2cb1afa1eb4992e830329cff7348e72dbd1867fc1627c27da2803d", false, "d231035515bcd43bcb6468179f21b5cddcb84977a17ed62f4f2661dffdc7e625"),
        Target(73504, "isJankScreenReportingEnabled", 37254886, 140, "3c44dd000080000000000020", "7bbd2be6ce35bef165f848d58bcdc0951d52bc0c6e1b3cf96556d52365ddbc50", false, "d7675cb8e98f258501f30511e22fc145d629c6bd11e13354ee0ae11a510106ff"),
        Target(74737, "isNavigationTTIEnabled", 37630863, 76, "8405de000080000000000020", "b668d6096837c8f6f2a9b85b00bf2a8b804623551127169b0b042153355acfa6", false, "1b91366e3ecbb96100df0c6d9aaecd7a20c421b416ec670a0699fa8b2881e593"),
        Target(62272, "beginNavigation", 34730514, 352, "8061d6000080000000000020", "9ffad4777be526348b56fc20ef7f7f0495cf44ec2151ce44ea59b2634a2fda89", false, "cbbe119790d2554398fce6b772969b385b27c6ef7bbf8e29ed7acc3d483f0eaa"),
        Target(62273, "recordComponentSpan", 34730866, 486, "a861d6000080000000000020", "a3604108d4eef085c0b7d62dbfe8837f8d542df87664efff6e03715822d5b851", false, "2c66f444352d29b4280dbec1c0169d4000863913b231a86f22b0c099c1c4c1db"),
        Target(62281, "recordLateComponentLayout", 34732110, 246, "e862d6000080000000000020", "d05da2e2c669bc8b78805051698f8823b2cd18148d775bc51a842b9a9c4fe816", false, "65ddb7f75c93193256550514eaacb6631fc3d409f1699cfadb1d87bd753c6f12"),
        Target(62285, "flush", 34732722, 236, "8863d6000080000000000020", "f97f22f7c868da20ad2f0df58c859f6895f4df84dbbc937309449b35b16283f5", false, "04369ca3ea803ade42a6a72f153d71521b4cf44ac25f8920f84875a7d55984a3"),
        Target(76347, "trackHttpRequest", 38258095, 220, "9401df000080000000000020", "52afd0cd3e603aeb9f8690b6da23834c596351e3ca86404c9a301b8ae593a825", false, "8a58471d674d2e171893e7a658ab4da7fc99619fbc9f7858db13d05f76b6e50d"),
        Target(76834, "_initialize", 38315674, 71, "384edf000080000000000020", "df37be700117725540ecdc28bd2f43fccff80adb1219fef3244d69b49ae4222b", false, "de9a56d1d3793e4dc8caaf41696df8a790fb8f273d98c1771ba9a178f9b574cc"),
        Target(76837, "deliverPendingSessions", 38315893, 122, "b04edf000080000000000020", "45a37240bf88cb3a4471d974a5d518a2cd6e8b6196d7b5b29e316022ae262f3e", false, "d874fd2ca114497962a6b7bf4108deb22119c8f0cc4d0bdd5ef2391f3c139d2d"),
        Target(76839, "attach", 38316035, 120, "004fdf000080000000000020", "fc924219e89558eec3841b301543143e697835cb1977448a9815718085182008", false, "6d5ecc9607bea3b520542446b111d50a7877e29f764b7dc8a6233b3b1a49f235"),
        Target(76840, "handleDispatch", 38316155, 192, "284fdf000080000000000020", "014b5b45eb7ab0526a30e92ab28632b4bbf2cf9e961783e3329ecbb9595e7d95", false, "ea5106b3233aa906e218ac0f837ab4e10d19d89ec752f6069f99a1c34195c2ea"),
        Target(76841, "handleStateSettled", 38316347, 188, "504fdf000080000000000020", "ac26d09593d23cd898b42cab05cb5eeb67603eceaea07964df26f8abb196eb25", false, "c2416a737a9427908b46bea6bc516f8a761f3f9e636ffac1eaf798492dff4466"),
        Target(76847, "handleAppStateUpdate", 38317462, 119, "4050df000080000000000020", "f69a3efb2b1258c31989eec111331026a0c5e1463d6e26bcb12f822d2f9c89db", false, "ead4c07d3d1d25587171a0ea318812b147cd6e51bfd3b811ef070674e6a23890"),
        Target(76848, "handleConnectionOpenSupplemental", 38317581, 37, "6850df000080000000000020", "d42a98159fa564344f2995c1c5e4d56ea32dc2070f2f0b1e9c7c21bb61b66271", false, "c61c09e2940029142145a27ba2e91ba036a476b85311f6bcd26e4348a4dab83c"),
        Target(76849, "scheduleReport", 38317618, 69, "9050df000080000000000020", "9c7baf4d2cf140dbe079e63aee85a66d2901868dd0d4e35980a778cf927ef6d2", false, "ab25c567f8eca57c179a5d510dd310a3164aafabb2151faeb6bd3932ff104f75"),
        Target(76850, "sendReport", 38317687, 211, "b850df000080000000000020", "13b76aba7ae92beb6e06bf16bf56433970a1a41b35b54f8a019830238b4b0b4d", false, "593bfa1a2db7eda55a4e74e45df11a0aac89d39eaa1029d20d3f4d7173e32c5e"),
        Target(78264, "handleChannelSelect", 38656155, 337, "002fe0000080000000000020", "19303259f314e602208875d5d3b9f11bd6e7d2046b315b2166ba3f7a31e1edc5", false, "c5e799e519e7adce4a9ddea414923a1c49422a1cf9b36ff9e1df3410a6a80885"),
        Target(78407, "flushDelayLogs", 38683670, 163, "6046e0000080000000000020", "4ac3a9ef151015983416e8bbf384e23ab546e157f1e07a42a30c93a2c4ebed45", false, "ef3f963c73d47f656cf9da85d93547fdb24f540ff96d00bc3284712f34690a62"),
        Target(78408, "onTimersDelayCallback", 38683833, 246, "8846e0000080000000000020", "a16524c68b35d204f86ffbded94b40494c05dc27729c791abeecb3f9d8c2208b", false, "d6adc92492490a0221f61fafe19ea0c40c9587085e92bfb70fa29c13e9a56298"),
        Target(78409, "setupLibdiscoreTimersMonitor", 38684079, 39, "b046e0000080000000000020", "119165ceb3f1f2c2e11fd05f9a549d56781b9344c314d45ad23044cf8d98a458", false, "e5d5fb0ce3b5bb969d328a4a38862c440caa3c0a2263bf77c5d9342ff02af5b9"),
    )
    val crash = listOf(
        Target(80637, "send", 38950956, 179, "f497e1000080000000000020", "b7742cc4829a65825a2135f28f6b3c157d5f21275812183bb4c9316226b7f6f4", true, "f1adae49c159c8c3711345eb1c9c91ea52049dca1da716ba6a92f7b627a17ca4"),
        Target(105728, "send", 41090986, 181, "d87ef0000080000000000020", "f85fd1f33baeb705837546935425df0e95515a4a08ffb27b41037b1c1e109f76", true, "381066562adb3cec36e87f246e5bd488c6a96b8d94e95c6874c08a809f5ad0d0"),
        Target(25860, "initSentry", 29303311, 43, "e0cbc1000080000000000020", "dbcdeb69ea5f2d65b9a44e73407275ec3b6603a250cc6e29ad429d0b1462b1a3", false, "660c1a956cb32e02793f2c072066a593b04439fae9ec4439295b04d05bcef2e7"),
        Target(22838, "addSentryBreadcrumb", 28860366, 96, "6823c0000080000000000020", "e56fe3a873e2a7c236ebcaa9b737e8f5b19925dcf42385c942498472e6e48ed1", false, "8014aa1544c381151768f75d6eacc48a356ac0b68793518f02cdbc0638fbea50"),
        Target(25841, "setUser", 29299985, 104, "d8c8c1000080000000000020", "ee41783f1c4bf466066aafe5715e5b8112a2ff9ca9994824e397afef2bf8ef12", false, "c64a06a661b05ec1f2461f1248f2fcca3df28d4b53c8b6b05c18cf6978a41473"),
        Target(25842, "clearUser", 29300089, 78, "00c9c1000080000000000020", "64c0da92bff7add1161674f422f0fe1b97836e844a6f46871ac8e6eb09b33c38", false, "e2efd1d754b3ad7a7187a61aa8fd45d176263ea6dbc422403dc9810f25852ed4"),
        Target(25843, "setTags", 29300167, 48, "28c9c1000080000000000020", "9abac5adceeb641ddd3745a8311dd824a21dbc6d6014614ce3884481470248e2", false, "cdae2ebfa1bdcf505dde247f580372b2feac8f87e0d32032a1f7764a61f2d11d"),
        Target(25844, "setExtra", 29300215, 48, "50c9c1000080000000000020", "f01916f3825952d0b62a811aa4e198b42cc219b873dc59537006c688fc6ffcde", false, "94a05173a332e1d27fce8d23770b5cc9f4a72f91ad70455cfeaba6045e22732d"),
        Target(25845, "captureException", 29300263, 87, "78c9c1000080000000000020", "9c2ca529c61dc81460283ec862b7c266adb96b04d523849e7a16c85e26b8dcd7", false, "3e31096f1cac624a77d6e7f5663f3e16ecf510f9a5ecbe49711f0bf1a62c852d"),
        Target(25846, "captureCrash", 29300350, 161, "a0c9c1000080000000000020", "0b6142720cd15309d1a039d0f7a149a559c1acfd189d7fa83a65f18fc7ec6aa0", false, "5c02173dd2e78f810222392e7b83ce1f759c5367bf59ddc4d34f1edd92c7cb36"),
        Target(25847, "captureMessage", 29300511, 90, "c8c9c1000080000000000020", "205b344f4a62822eff1ed947de12d6192a9d181675c4194daf39693b08524d83", false, "0518a5074eb0c5f1cab699087725d250b5793010a1f6746fb0e35a13b703c62e"),
        Target(25848, "addFeatureFlag", 29300601, 106, "f0c9c1000080000000000020", "3667687033f25d629547f0f6f1d800cd09610d5fe9cb10eb337ac348f2ec47d7", false, "26f5f4c24dcb67cb3c75749cf914c2bc5c6ef4f66128bc4481af8ab401ca88a6"),
        Target(25849, "addBreadcrumb", 29300707, 54, "18cac1000080000000000020", "26506a0ce3be8215ac9f7408f55780ea40fa6b2878f4e6e56878fd880d5631b6", false, "92adc8c696ca6b6f388728f682c0afb9e8429c7e7bcf1839e13a6c4738ba8a99"),
        Target(25854, "getLastCrashReport", 29300975, 35, "f0cac1000080000000000020", "eefd39afa90bd79eb46f29d65513a11b8fdf7bfa00860a35d09469c694cc5a86", true, "256115f6daa47ec37e971a658ebee074e288337c4524ed56f6682e018d4e6114"),
        Target(25859, "trackCrash", 29302040, 1271, "b8cbc1000080000000000020", "0f3628cffd756c062d93109683c217aac79b657680eef8c4296c54401e88cb7b", false, "8b92cc30e72e2305740b4fd202d0c1216b041fc4df89e50b73cb513bdf9b2d4c"),
        Target(78410, "init", 38684118, 23, "d846e0000080000000000020", "48b7eba6fbde65c38f0af85273a1d560cc7e5da76d4828b64284bcb9469534f8", false, "d401072609077fd81e41282a0006c59381091139c906d0545352ebf45b85fa29"),
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
            if (target.expandedHeaderHash.isNotEmpty()) {
                val small = 128 + target.id * 12
                require(bytes[small + 11].toInt() and 0x20 != 0) { "Expected expanded header: ${target.name} #${target.id}" }
                val expanded = (((header.getInt(small + 4) ushr 14) and 255) shl 24) or (header.getInt(small) and 0x1ffffff)
                require(digest(bytes.copyOfRange(expanded, expanded + 40)) == target.expandedHeaderHash) {
                    "HBC expanded header changed: ${target.name} #${target.id}"
                }
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
    /**
     * Identical result to [rewrite], applied in place: validates every target first, then only
     * the selected function bodies and the SHA-1 footer are written. Streams the footer hashes
     * instead of loading and copying the whole bundle once per selected privacy group.
     */
    fun apply(file: File, targets: List<Target>) {
        RandomAccessFile(file, "rw").use { raf ->
            val length = raf.length()
            require(length >= 148) { "Truncated Hermes asset" }
            fun read(offset: Long, size: Int) = ByteArray(size).also { raf.seek(offset); raf.readFully(it) }
            val header = ByteBuffer.wrap(read(0, 128)).order(ByteOrder.LITTLE_ENDIAN)
            require(header.getInt(8) == 98 && header.getInt(32).toLong() == length) { "Invalid HBC98 file header" }
            require(streamDigestBytes(file, "SHA-1", length - 20).contentEquals(read(length - 20, 20))) {
                "Invalid HBC footer"
            }
            for (target in targets) {
                val compact = read(128L + target.id * 12L, 12)
                require(compact.contentEquals(hex(target.header))) { "HBC header changed: ${target.name} #${target.id}" }
                if (target.expandedHeaderHash.isNotEmpty()) {
                    require(compact[11].toInt() and 0x20 != 0) { "Expected expanded header: ${target.name} #${target.id}" }
                    val words = ByteBuffer.wrap(compact).order(ByteOrder.LITTLE_ENDIAN)
                    val expanded = (((words.getInt(4) ushr 14) and 255) shl 24) or (words.getInt(0) and 0x1ffffff)
                    require(digest(read(expanded.toLong(), 40)) == target.expandedHeaderHash) {
                        "HBC expanded header changed: ${target.name} #${target.id}"
                    }
                }
                require(digest(read(target.offset.toLong(), target.size)) == target.sha256) {
                    "HBC body changed: ${target.name} #${target.id}"
                }
            }
            for (target in targets) {
                val stub = stub(target)
                require(stub.size <= target.size)
                val body = ByteArray(target.size)
                stub.copyInto(body)
                raf.seek(target.offset.toLong())
                raf.write(body)
            }
            // Same-process writes are visible to the streamed read; no flush to disk needed.
            val footer = streamDigestBytes(file, "SHA-1", length - 20)
            raf.seek(length - 20)
            raf.write(footer)
        }
    }
}
