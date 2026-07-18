package com.pjsktools.app.feature.catalog

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlin.coroutines.resumeWithException

private sealed interface RemoteImageState {
    data object Loading : RemoteImageState
    data class Ready(val bitmap: androidx.compose.ui.graphics.ImageBitmap) : RemoteImageState
    data class Failed(val reason: String) : RemoteImageState
}

private val catalogImageClient = OkHttpClient()
private const val maxImageBytes = 12 * 1024 * 1024
private const val maxDecodedDimension = 1200
private val catalogBitmapCache = object : LruCache<String, Bitmap>(32 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount / 1024
}

/** Settings uses this to make its cache controls affect the real in-memory image cache. */
fun clearCatalogImageCache() {
    catalogBitmapCache.evictAll()
}

@Composable
internal fun RemoteCatalogImage(
    baseUrl: String,
    candidates: List<String>,
    contentDescription: String,
    modifier: Modifier = Modifier,
    heightDp: Int = 180
) {
    val state by produceState<RemoteImageState>(
        initialValue = RemoteImageState.Loading,
        baseUrl,
        candidates
    ) {
        value = loadFirstImage(baseUrl, candidates)
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(heightDp.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        when (val current = state) {
            RemoteImageState.Loading -> CircularProgressIndicator()
            is RemoteImageState.Ready -> Image(
                bitmap = current.bitmap,
                contentDescription = contentDescription,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize()
            )
            is RemoteImageState.Failed -> Text(
                text = current.reason,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(12.dp)
            )
        }
    }
}

private suspend fun loadFirstImage(baseUrl: String, candidates: List<String>): RemoteImageState =
    withContext(Dispatchers.IO) {
        if (candidates.isEmpty()) return@withContext RemoteImageState.Failed("暂无图片资源")
        val root = baseUrl.trimEnd('/').toHttpUrlOrNull()
            ?: return@withContext RemoteImageState.Failed("后端地址无效")
        var lastReason = "所有图片候选均不可用"
        for (candidate in candidates.distinct()) {
            if (candidate.substringBefore('?').endsWith(".svg", ignoreCase = true)) {
                lastReason = "当前 Android 原生解码器不支持 SVG，正在尝试 PNG 候选"
                continue
            }
            val resolved = candidate.toHttpUrlOrNull() ?: root.resolve(candidate)
            if (resolved == null) {
                lastReason = "图片地址无效"
                continue
            }
            catalogBitmapCache.get(resolved.toString())?.let {
                return@withContext RemoteImageState.Ready(it.asImageBitmap())
            }
            val result = runCatching {
                val bytes = downloadBoundedImage(Request.Builder().url(resolved).get().build())
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) error("图片格式不受支持")
                var sample = 1
                while (bounds.outWidth / sample > maxDecodedDimension || bounds.outHeight / sample > maxDecodedDimension) sample *= 2
                val bitmap = BitmapFactory.decodeByteArray(
                    bytes, 0, bytes.size,
                    BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
                ) ?: error("图片解码失败")
                catalogBitmapCache.put(resolved.toString(), bitmap)
                RemoteImageState.Ready(bitmap.asImageBitmap())
            }
            result.getOrNull()?.let { return@withContext it }
            lastReason = result.exceptionOrNull()?.message ?: lastReason
        }
        RemoteImageState.Failed("图片加载失败：$lastReason")
    }

private suspend fun downloadBoundedImage(request: Request): ByteArray = suspendCancellableCoroutine { continuation ->
    val call = catalogImageClient.newCall(request)
    continuation.invokeOnCancellation { call.cancel() }
    call.enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (continuation.isActive) continuation.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            response.use {
                if (!response.isSuccessful) {
                    if (continuation.isActive) continuation.resumeWithException(IOException("HTTP ${response.code}"))
                    return
                }
                val body = response.body
                val contentType = body?.contentType()?.toString().orEmpty()
                if (contentType.contains("svg", ignoreCase = true)) {
                    if (continuation.isActive) continuation.resumeWithException(IOException("SVG 需要 PNG 候选"))
                    return
                }
                if (body == null || body.contentLength() > maxImageBytes) {
                    if (continuation.isActive) continuation.resumeWithException(IOException("图片超过 12MB 安全限制"))
                    return
                }
                runCatching {
                    val output = ByteArrayOutputStream()
                    body.byteStream().use { input ->
                        val buffer = ByteArray(16 * 1024)
                        var total = 0
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            total += read
                            if (total > maxImageBytes) error("图片超过 12MB 安全限制")
                            output.write(buffer, 0, read)
                        }
                    }
                    output.toByteArray()
                }.onSuccess { if (continuation.isActive) continuation.resumeWith(Result.success(it)) }
                    .onFailure { if (continuation.isActive) continuation.resumeWithException(it) }
            }
        }
    })
}
