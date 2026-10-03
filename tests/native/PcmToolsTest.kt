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
fun main() {
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
    println("PASS: $passed PCM/waveform checks (real signal, rate conversion, duration, silence, chunk invariance)")
}
