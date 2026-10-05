package app.venus.patches

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.security.MessageDigest

/** Single-load prelude for the SHA-256-pinned HBC98 asset. No rebundling or native JNI hooks. */
internal object HbcPrelude {
    data class Result(val prefixSize: Int, val originalCodeSize: Int, val codeOffset: Int)
    private fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
        .joinToString("") { "%02x".format(it) }

    fun inject(file: File, source: String): Result {
        require(source.length in 1..120000) { "Unexpected bootstrap size" }
        var result: Result
        RandomAccessFile(file, "rw").use { raf ->
            fun intAt(offset: Long): Int { raf.seek(offset); return Integer.reverseBytes(raf.readInt()) }
            fun putInt(offset: Long, value: Int) { raf.seek(offset); raf.writeInt(Integer.reverseBytes(value)) }
            require(intAt(8) == 98 && intAt(36) == 0 && intAt(40) == 128714)
            val oldLength = raf.length().toInt()
            require(intAt(32) == oldLength)
            // HBC98 has a 128-byte aligned header and 12-byte compact function headers.
            val small = 128L
            val word0 = intAt(small)
            val word1 = intAt(small + 4)
            raf.seek(small + 11)
            require(raf.readUnsignedByte() and 0x20 != 0) { "Expected expanded global function header" }
            val large = ((word1 ushr 14) and 255).toLong().shl(24) or (word0 and 0x1ffffff).toLong()
            val offset = intAt(large)
            val size = intAt(large + 12)
            val frame = intAt(large + 28)
            raf.seek(large + 32)
            val reads = raf.readUnsignedByte()
            val writes = raf.readUnsignedByte()
            val cacheNewObjects = raf.readUnsignedByte()
            val privateNames = raf.readUnsignedByte()
            val flags = raf.readUnsignedByte()
            require(frame == 30 && reads == 25 && flags and 8 == 0)
            // This APK uses Hermes V1's 40-byte expanded header (not the legacy 36-byte parser layout).
            // The relocated global's old PC debug map is invalid after prefixing; other functions keep theirs.
            require(size == 607799 && offset == 13799420)
            raf.seek(offset.toLong())
            val original = ByteArray(size).also { raf.readFully(it) }
            require(hash(original) == "f392ecbf2de34d1960b89a97035d692edcd024f75e2e98e4328eba77d083e697")
            val table = 128L + intAt(40).toLong() * 12 + intAt(44).toLong() * 4 + intAt(48).toLong() * 4
            val count = intAt(52)
            val storage = table + count.toLong() * 4 + intAt(56).toLong() * 8
            val chars = HashMap<Char, Int>()
            for (id in 0 until count) {
                val entry = intAt(table + id.toLong() * 4)
                if (entry ushr 24 != 1 || entry and 1 != 0) continue
                raf.seek(storage + ((entry ushr 1) and 0x7fffff))
                chars.putIfAbsent(raf.readUnsignedByte().toChar(), id)
            }
            require(source.all { it in chars }) { "Bootstrap contains unsupported characters" }
            val prefix = ByteArrayOutputStream()
            fun emit(vararg bytes: Int) { for (byte in bytes) prefix.write(byte) }
            fun u32(value: Int) { for (shift in 0..24 step 8) prefix.write(value ushr shift) }
            fun string(register: Int, id: Int) {
                if (id < 65536) emit(144, register, id and 255, id ushr 8)
                else { emit(145, register); u32(id) }
            }
            // An array + join is linear-time and reuses existing literal strings. No string table changes.
            emit(61, 10) // GetGlobalObject r10
            val initialCapacity = minOf(source.length, 65535)
            emit(8, 11, initialCapacity and 255, initialCapacity ushr 8) // NewArray r11
            source.forEachIndexed { index, character ->
                string(12, chars.getValue(character))
                if (index < 256) emit(88, 11, 12, index) // DefineOwnByIndex
                else { emit(89, 11, 12); u32(index) }
            }
            // Cache slots are per function. Never reuse the original global's 0..24 caches.
            emit(69, 12, 11, reads, 154, 0) // GetById join
            string(13, 255) // empty delimiter
            emit(110, 11, 12, 11, 13) // Call2 join -> r11
            emit(69, 12, 10, reads + 1, 30161 and 255, 30161 ushr 8) // GetById eval
            emit(110, 13, 12, 10, 11) // indirect eval of the bundled IIFE
            val end = prefix.size()
            emit(175); u32(7) // normal path skips Catch and falls into the original global code
            val handler = prefix.size()
            emit(119, 14) // Catch: fail open to Discord if local prelude evaluation fails
            val prelude = prefix.toByteArray()
            raf.setLength((oldLength - 20).toLong()) // remove old SHA-1 footer
            var bodyOffset = oldLength - 20
            while (bodyOffset % 4 != 0) { raf.seek(bodyOffset++.toLong()); raf.write(0) }
            raf.seek(bodyOffset.toLong())
            raf.write(prelude)
            raf.write(original)
            while (raf.filePointer % 4 != 0L) raf.write(0)
            val newHeader = raf.filePointer
            require(newHeader < 0x100000000L)
            raf.seek(large)
            val expanded = ByteArray(40).also { raf.readFully(it) }
            raf.seek(newHeader)
            raf.write(expanded)
            putInt(newHeader, bodyOffset)
            putInt(newHeader + 12, prelude.size + original.size)
            raf.seek(newHeader + 32)
            raf.write(reads + 2); raf.write(writes); raf.write(cacheNewObjects); raf.write(privateNames)
            raf.write((flags and 0xef) or 8)
            // Expanded header is followed by count + (start, end, target) exception records.
            putInt(newHeader + 40, 1)
            putInt(newHeader + 44, 0)
            putInt(newHeader + 48, end)
            putInt(newHeader + 52, handler)
            putInt(small, newHeader.toInt() and 0xffffff)
            putInt(small + 4, ((newHeader.toInt() ushr 24) and 255) shl 14)
            putInt(32, (raf.length() + 20).toInt())
            result = Result(prelude.size, original.size, bodyOffset)
        }
        val digest = MessageDigest.getInstance("SHA-1")
        file.inputStream().use { input ->
            val buffer = ByteArray(65536)
            while (true) { val read = input.read(buffer); if (read < 0) break; digest.update(buffer, 0, read) }
        }
        FileOutputStream(file, true).use { it.write(digest.digest()) }
        return result
    }
}
