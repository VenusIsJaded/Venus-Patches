package app.venus.extension

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Fixed-memory waveform accumulator: actual PCM peaks, not placeholder bars. */
class Waveform {
    private val windows = IntArray(12001)
    private var count = 0
    private var frames = 0
    private var peak = 0

    fun add(sample: Int) {
        peak = maxOf(peak, abs(sample))
        if (++frames == 4800) flush()
    }
    private fun flush() {
        check(count < windows.size) { "Audio exceeds the 20-minute safety limit" }
        windows[count++] = peak
        peak = 0
        frames = 0
    }
    fun base64(): String {
        if (frames > 0) flush()
        val result = ByteArray(min(64, maxOf(1, count)))
        val max = windows.take(count).maxOrNull() ?: 0
        for (bin in result.indices) {
            val start = bin * count / result.size
            val end = maxOf(start + 1, (bin + 1) * count / result.size)
            var value = 0
            for (i in start until min(end, count)) value = maxOf(value, windows[i])
            result[bin] = if (max == 0) 0 else (sqrt(value.toDouble() / max) * 255).roundToInt().toByte()
        }
        return Base64.getEncoder().encodeToString(result)
    }
}

/** Streaming downmix/resample to 48 kHz mono PCM16; no whole-file PCM buffering. */
class PcmResampler(private val rate: Int, private val channels: Int, private val floating: Boolean) {
    init {
        require(rate in 8000..192000 && channels in 1..8) { "Unsupported PCM layout" }
    }
    val waveform = Waveform()
    var outputFrames = 0L
        private set
    private var inputFrames = 0L
    private var nextPosition = 0.0
    private var previous = 0.0
    private val step = rate.toDouble() / 48000.0

    private fun write(value: Double, out: ByteArrayOutputStream) {
        check(outputFrames < 48000L * 1200) { "Audio exceeds the 20-minute safety limit" }
        val sample = value.roundToInt().coerceIn(-32768, 32767)
        out.write(sample and 255)
        out.write((sample shr 8) and 255)
        waveform.add(sample)
        outputFrames++
    }
    fun convert(buffer: ByteBuffer): ByteArray {
        buffer.order(ByteOrder.LITTLE_ENDIAN)
        val bytesPerFrame = channels * if (floating) 4 else 2
        require(buffer.remaining() % bytesPerFrame == 0) { "Incomplete PCM frame" }
        val out = ByteArrayOutputStream()
        while (buffer.remaining() >= bytesPerFrame) {
            var sum = 0.0
            repeat(channels) { sum += if (floating) buffer.float.toDouble() * 32767 else buffer.short.toDouble() }
            val current = sum / channels
            if (inputFrames == 0L) previous = current
            while (nextPosition <= inputFrames.toDouble()) {
                val fraction = if (inputFrames == 0L) 1.0 else nextPosition - (inputFrames - 1)
                write(previous + (current - previous) * fraction.coerceIn(0.0, 1.0), out)
                nextPosition += step
            }
            previous = current
            inputFrames++
        }
        return out.toByteArray()
    }
    fun finish(): ByteArray {
        val out = ByteArrayOutputStream()
        while (nextPosition < inputFrames.toDouble()) {
            write(previous, out)
            nextPosition += step
        }
        return out.toByteArray()
    }
}
