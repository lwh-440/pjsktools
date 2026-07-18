package com.pjsktools.app.feature.content

import android.graphics.BitmapFactory
import android.content.Context
import android.content.ContextWrapper
import android.media.MediaPlayer
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private val mediaClient = OkHttpClient()

private sealed interface ImageState {
    data object Loading : ImageState
    data class Ready(val bitmap: androidx.compose.ui.graphics.ImageBitmap) : ImageState
    data class Failed(val reason: String) : ImageState
}

@Composable
internal fun RemoteContentImage(
    baseUrl: String,
    candidates: List<String>,
    description: String,
    modifier: Modifier = Modifier,
    height: Int = 170
) {
    val state by produceState<ImageState>(ImageState.Loading, baseUrl, candidates) {
        var reason = "暂无图片资源"
        value = ImageState.Loading
        for (candidate in candidates.distinct()) {
            if (candidate.substringBefore('?').endsWith(".svg", true)) continue
            val url = resolveUrl(baseUrl, candidate)
            if (url == null) { reason = "图片地址无效"; continue }
            val result = try {
                val bytes = downloadImage(url)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: error("图片解码失败")
                Result.success(ImageState.Ready(bitmap.asImageBitmap()))
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Throwable) {
                Result.failure(failure)
            }
            result.getOrNull()?.let { value = it; return@produceState }
            reason = result.exceptionOrNull()?.message ?: reason
        }
        value = ImageState.Failed(reason)
    }
    Box(modifier.fillMaxWidth().height(height.dp).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
        when (val current = state) {
            ImageState.Loading -> CircularProgressIndicator()
            is ImageState.Ready -> Image(current.bitmap, description, Modifier.fillMaxWidth(), contentScale = ContentScale.Fit)
            is ImageState.Failed -> Text(current.reason, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(12.dp))
        }
    }
}

@Composable
internal fun RemoteAudioQueue(baseUrl: String, entries: List<PlaybackEntry>) {
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var activeUrl by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    DisposableEffect(Unit) { onDispose { player?.release() } }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        entries.take(24).forEach { entry ->
            val resolved = resolveUrl(baseUrl, entry.url)
            if (activeUrl == resolved) Button(onClick = {
                player?.release(); player = null; activeUrl = null; status = null
            }) { Text("停止 · ${entry.label}") }
            else OutlinedButton(onClick = {
                player?.release(); player = null; activeUrl = resolved
                if (resolved == null) { status = "媒体地址无效"; return@OutlinedButton }
                status = "正在缓冲 ${entry.label}…"
                runCatching {
                    MediaPlayer().also { next ->
                        player = next
                        next.setDataSource(resolved)
                        next.setOnPreparedListener { it.start(); status = "正在播放 ${entry.label}" }
                        next.setOnCompletionListener { status = "播放完成 ${entry.label}"; activeUrl = null }
                        next.setOnErrorListener { _, what, extra -> status = "播放失败（$what/$extra）"; true }
                        next.prepareAsync()
                    }
                }.onFailure { status = it.message ?: "播放初始化失败" }
            }) { Text("播放 · ${entry.label}") }
        }
        status?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
internal fun InformationWebContent(baseUrl: String, path: String, modifier: Modifier = Modifier) {
    val url = resolveUrl(baseUrl, path)
    if (url == null) {
        Text("公告正文地址无效", color = MaterialTheme.colorScheme.error)
        return
    }
    var webView by remember(url) { mutableStateOf<WebView?>(null) }
    DisposableEffect(url) {
        onDispose {
            webView?.stopLoading()
            webView?.loadUrl("about:blank")
            webView?.destroy()
            webView = null
        }
    }
    AndroidView(
        modifier = modifier.fillMaxWidth().height(520.dp),
        factory = { context ->
            WebView(context).apply {
                webView = this
                settings.javaScriptEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                webViewClient = WebViewClient()
                loadUrl(url)
            }
        },
        update = { if (it.url != url) it.loadUrl(url) }
    )
}

@Composable
internal fun WebParityRuntime(
    runtimeBaseUrl: String,
    region: String,
    route: String,
    title: String,
    modifier: Modifier = Modifier
) {
    val runtime = remember(runtimeBaseUrl, route, region) { webRuntimeTarget(runtimeBaseUrl, route, region) }
    var status by remember(runtime) { mutableStateOf("正在启动网页同源运行时…") }
    var webView by remember(runtime) { mutableStateOf<WebView?>(null) }
    var canGoBack by remember(runtime) { mutableStateOf(false) }
    var mainFrameFailed by remember(runtime) { mutableStateOf(false) }
    var runtimeGeneration by remember(runtime) { mutableStateOf(0) }
    val localContext = LocalContext.current
    val lifecycleOwner = remember(localContext) { localContext.findLifecycleOwner() }

    fun destroyRuntime(blankFirst: Boolean = true) {
        webView?.stopLoading()
        if (blankFirst) webView?.loadUrl("about:blank")
        webView?.onPause()
        webView?.pauseTimers()
        webView?.clearHistory()
        webView?.removeAllViews()
        webView?.destroy()
        webView = null
        canGoBack = false
    }

    fun failClosed(message: String) {
        if (mainFrameFailed) return
        mainFrameFailed = true
        status = message
        destroyRuntime()
    }

    DisposableEffect(runtime, lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START, Lifecycle.Event.ON_RESUME -> if (!mainFrameFailed) {
                    webView?.onResume()
                    webView?.resumeTimers()
                }
                Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP -> {
                    webView?.evaluateJavascript(
                        "document.querySelectorAll('audio,video').forEach(function(media){media.pause();});",
                        null
                    )
                    webView?.onPause()
                    webView?.pauseTimers()
                }
                Lifecycle.Event.ON_DESTROY -> destroyRuntime()
                else -> Unit
            }
        }
        lifecycleOwner?.lifecycle?.addObserver(observer)
        onDispose {
            lifecycleOwner?.lifecycle?.removeObserver(observer)
            destroyRuntime()
        }
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
        Text(status, style = MaterialTheme.typography.bodySmall)
        if (runtime == null) {
            Text(
                "交互运行时未配置。发布 APK 时必须设置 PJSKTOOLS_WEB_RUNTIME_BASE_URL 为已部署网页端的 HTTPS 地址。",
                color = MaterialTheme.colorScheme.error
            )
            return@Column
        }
        if (mainFrameFailed) {
            Text("交互运行时已安全关闭，不会显示网络或 HTTP 错误页。", color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = {
                mainFrameFailed = false
                status = "正在重新创建网页运行时…"
                runtimeGeneration++
            }) { Text("重新创建交互运行时") }
            Text("允许运行时来源：${runtime.origin}", style = MaterialTheme.typography.labelSmall)
            return@Column
        }
        key(runtimeGeneration) {
            AndroidView(
                modifier = Modifier.fillMaxWidth().height(620.dp),
                factory = { context ->
                    WebView(context).apply {
                        webView = this
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.mediaPlaybackRequiresUserGesture = true
                        settings.cacheMode = WebSettings.LOAD_DEFAULT
                        setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
                        webViewClient = object : WebViewClient() {
                            override fun onPageFinished(view: WebView, loadedUrl: String) {
                                if (mainFrameFailed || loadedUrl == "about:blank") return
                                if (!sameOrigin(loadedUrl, runtime.origin)) {
                                    failClosed("已阻止非白名单页面：$loadedUrl")
                                    return
                                }
                                status = "网页运行时已加载；模型资源仍按需从同一后端读取。"
                                canGoBack = view.canGoBack()
                            }
                            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                                if (request.isForMainFrame) failClosed("网页运行时加载失败：${error.description}")
                            }
                            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                                if (request.isForMainFrame) failClosed("网页运行时响应失败：HTTP ${errorResponse.statusCode}")
                            }
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                val allowed = sameOrigin(request.url.toString(), runtime.origin)
                                if (!allowed && request.isForMainFrame) failClosed("已阻止跳转到非白名单来源：${request.url.host.orEmpty()}")
                                return !allowed
                            }
                        }
                        loadUrl(runtime.url)
                        if (lifecycleOwner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == false) {
                            onPause()
                            pauseTimers()
                        }
                    }
                },
                update = { view -> if (view.url != runtime.url) view.loadUrl(runtime.url) }
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { webView?.goBack() }, enabled = canGoBack) { Text("网页内返回") }
            OutlinedButton(onClick = {
                status = "正在重新加载网页运行时…"
                mainFrameFailed = false
                webView?.reload()
            }) { Text("重新加载交互运行时") }
        }
        Text("允许运行时来源：${runtime.origin}", style = MaterialTheme.typography.labelSmall)
    }
}

private fun resolveUrl(baseUrl: String, candidate: String): String? {
    val direct = candidate.toHttpUrlOrNull()
    if (direct != null) return direct.toString()
    return baseUrl.trimEnd('/').toHttpUrlOrNull()?.resolve(candidate)?.toString()
}

private data class WebRuntimeTarget(val url: String, val origin: String)

private fun webRuntimeTarget(baseUrl: String, route: String, region: String): WebRuntimeTarget? {
    val root = baseUrl.trim().trimEnd('/').toHttpUrlOrNull() ?: return null
    if (root.scheme !in setOf("http", "https") || root.username.isNotEmpty() || root.password.isNotEmpty()) return null
    val routePath = route.substringBefore('?').takeIf { it.startsWith('/') } ?: return null
    val builder = root.newBuilder().encodedPath(routePath).query(null)
    route.substringAfter('?', "").takeIf(String::isNotBlank)?.split('&')?.forEach { part ->
        val key = part.substringBefore('=')
        val value = part.substringAfter('=', "")
        if (key.isNotBlank() && key != "region") builder.addEncodedQueryParameter(key, value)
    }
    builder.addQueryParameter("region", region)
    val url = builder.build().toString()
    return WebRuntimeTarget(url, rootOrigin(root))
}

private fun rootOrigin(url: okhttp3.HttpUrl): String = buildString {
    append(url.scheme).append("://").append(url.host)
    if (url.port != if (url.scheme == "https") 443 else 80) append(':').append(url.port)
}

private fun sameOrigin(candidate: String, allowedOrigin: String): Boolean = candidate.toHttpUrlOrNull()?.let(::rootOrigin) == allowedOrigin

private tailrec fun Context.findLifecycleOwner(): LifecycleOwner? = when (this) {
    is LifecycleOwner -> this
    is ContextWrapper -> baseContext.findLifecycleOwner()
    else -> null
}

private suspend fun downloadImage(url: String): ByteArray = suspendCancellableCoroutine { continuation ->
    val call = mediaClient.newCall(Request.Builder().url(url).get().build())
    continuation.invokeOnCancellation { call.cancel() }
    call.enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (continuation.isActive) continuation.resumeWithException(e)
        }
        override fun onResponse(call: Call, response: Response) {
            response.use {
                val body = response.body
                if (!response.isSuccessful || body == null) {
                    if (continuation.isActive) continuation.resumeWithException(IOException("图片请求失败：HTTP ${response.code}"))
                    return
                }
                val contentType = body.contentType()
                if (contentType?.type != "image") {
                    if (continuation.isActive) continuation.resumeWithException(IOException("资源不是图片（${contentType ?: "未知类型"}）"))
                    return
                }
                if (body.contentLength() > 12 * 1024 * 1024) {
                    if (continuation.isActive) continuation.resumeWithException(IOException("图片超过 12MB 限制"))
                    return
                }
                val bytes = body.bytes()
                if (bytes.size > 12 * 1024 * 1024) {
                    if (continuation.isActive) continuation.resumeWithException(IOException("图片超过 12MB 限制"))
                } else if (continuation.isActive) continuation.resume(bytes)
            }
        }
    })
}
