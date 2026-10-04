import app.venus.extension.PcmResampler
import app.venus.extension.Waveform
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64
import kotlin.math.abs
import kotlin.math.sin

private fun input(rate: Int, frames: Int, channels: Int = 1, floating: Boolean = false): ByteArray {
    val buffer = ByteBuffer.allocate(frames * channels * if (floating) 4 else 2).order(ByteOrder.LITTLE_ENDIAN)
    for (frame in 0 until frames) {
        val sample = (sin(2 * Math.PI * 440 * frame / rate) * 12000).toInt()
        repeat(channels) { if (floating) buffer.putFloat(sample / 32767f) else buffer.putShort(sample.toShort()) }
    }
    return buffer.array()
}
private fun convert(rate: Int, bytes: ByteArray, chunk: Int, channels: Int = 1, floating: Boolean = false): Pair<ByteArray, PcmResampler> {
    val converter = PcmResampler(rate, channels, floating)
    val out = ByteArrayOutputStream()
    var offset = 0
    while (offset < bytes.size) {
        val size = minOf(chunk, bytes.size - offset)
        out.write(converter.convert(ByteBuffer.wrap(bytes, offset, size).slice()))
        offset += size
    }
    out.write(converter.finish())
    return out.toByteArray() to converter
}
private fun benchmark() {
    // Synthetic JVM microbenchmark, not Android codec/startup/frame-rate evidence.
    for ((rate, channels) in listOf(48000 to 1, 44100 to 2)) {
        val pcm = input(rate, 960, channels)
        val times = LongArray(9)
        var checksum = 0L
        for (round in 0 until 14) {
            val converter = PcmResampler(rate, channels, false)
            val started = System.nanoTime()
            repeat(2000) {
                val out = converter.convert(ByteBuffer.wrap(pcm))
                checksum += out[0].toLong() + out.size
            }
            converter.finish()
            val elapsed = System.nanoTime() - started
            if (round >= 5) times[round - 5] = elapsed
        }
        java.util.Arrays.sort(times)
        println("BENCH rate=$rate channels=$channels median_ms=${times[4] / 1000000.0} checksum=$checksum")
    }
}
fun main(args: Array<String>) {
    if (args.contains("--benchmark")) { benchmark(); return }
    var passed = 0
    val mono = input(48000, 48000)
    val exact = convert(48000, mono, 960)
    check(exact.first.contentEquals(mono)) { "48k PCM16 mono must be bit-identical" }; passed++
    check(exact.second.outputFrames == 48000L); passed++
    for (rate in listOf(8000, 16000, 22050, 44100, 48000, 96000, 192000)) {
        val audio = input(rate, rate)
        val whole = convert(rate, audio, audio.size)
        val chunks = convert(rate, audio, 622)
        check(whole.first.contentEquals(chunks.first)) { "Chunk boundary changed PCM at $rate" }
        check(abs(chunks.second.outputFrames - 48000) <= 1) { "Wrong duration at $rate" }
        check(Base64.getDecoder().decode(chunks.second.waveform.base64()).size <= 64)
        passed++
    }
    val stereo = convert(48000, input(48000, 4800, 2), 960, 2).first
    check(stereo.contentEquals(input(48000, 4800))); passed++
    val floating = convert(48000, input(48000, 4800, 1, true), 960, 1, true).first
    val expected = input(48000, 4800)
    val a = ByteBuffer.wrap(floating).order(ByteOrder.LITTLE_ENDIAN)
    val b = ByteBuffer.wrap(expected).order(ByteOrder.LITTLE_ENDIAN)
    while (a.hasRemaining()) check(abs(a.short.toInt() - b.short.toInt()) <= 1)
    passed++
    val silence = Waveform()
    repeat(48000) { silence.add(0) }
    check(Base64.getDecoder().decode(silence.base64()).all { it.toInt() == 0 }); passed++
    val changing = Waveform()
    repeat(4800) { changing.add(100) }; repeat(4800) { changing.add(20000) }
    val bins = Base64.getDecoder().decode(changing.base64())
    check((bins[0].toInt() and 255) < (bins[1].toInt() and 255)); passed++
    check(runCatching { PcmResampler(48000, 1, false).convert(ByteBuffer.wrap(byteArrayOf(0))) }.isFailure); passed++
    check(runCatching { PcmResampler(1000, 1, false) }.isFailure); passed++
    val extrema = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
        .putShort(Short.MIN_VALUE).putShort(Short.MAX_VALUE).putShort(0).putShort(-1).array()
    val extremeOutput = convert(48000, extrema, 2)
    check(extremeOutput.first.contentEquals(extrema)); passed++
    check(extremeOutput.second.finish().isEmpty()); passed++
    check(PcmResampler(48000, 1, false).finish().isEmpty()); passed++
    val direct = ByteBuffer.allocateDirect(extrema.size + 4)
    direct.position(2); direct.put(extrema); direct.limit(2 + extrema.size); direct.position(2)
    check(PcmResampler(48000, 1, false).convert(direct).contentEquals(extrema)); passed++
    for (rate in listOf(8000, 44100, 48000, 192000)) {
        for (channels in listOf(1, 2, 8)) {
            val bytes = input(rate, 101, channels, true)
            check(convert(rate, bytes, bytes.size, channels, true).first
                .contentEquals(convert(rate, bytes, channels * 4, channels, true).first))
            passed++
        }
    }
    for (invalid in listOf(Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY)) {
        val bytes = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putFloat(invalid).array()
        check(runCatching { PcmResampler(48000, 1, true).convert(ByteBuffer.wrap(bytes)) }.isFailure)
        passed++
    }
    println("PASS: $passed PCM/waveform checks (real signal, rate conversion, duration, silence, chunk invariance)")
}
