package com.pjsktools.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BrokenImage
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.pjsktools.core.model.CatalogAsset
import com.pjsktools.core.model.CatalogKind
import java.util.concurrent.ConcurrentHashMap

private const val FAILED_SOURCE_TTL_MILLIS = 60_000L
private val successfulSources = ConcurrentHashMap<String, String>()
private val failedSources = ConcurrentHashMap<String, Long>()

fun orderedImageCandidates(vararg groups: List<String?>): List<String> = groups
    .flatMap { it }
    .mapNotNull { it?.trim()?.takeIf(String::isNotEmpty) }
    .distinct()

fun catalogListImageCandidates(kind: CatalogKind, assets: CatalogAsset): List<String> = when (kind) {
    CatalogKind.GACHA -> orderedImageCandidates(
        listOf(assets.bannerUrl, assets.imageUrl, assets.thumbnailUrl, assets.logoUrl, assets.screenUrl),
        assets.imageCandidates
    )
    CatalogKind.HONOR -> orderedImageCandidates(
        listOf(assets.degreeMainUrl, assets.imageUrl, assets.thumbnailUrl, assets.rankMainUrl, assets.scrollUrl),
        assets.imageCandidates
    )
    else -> orderedImageCandidates(
        listOf(assets.imageUrl, assets.thumbnailUrl, assets.bannerUrl, assets.logoUrl, assets.degreeMainUrl),
        assets.imageCandidates
    )
}

fun catalogDetailImageCandidates(kind: CatalogKind, assets: CatalogAsset): List<String> = catalogListImageCandidates(kind, assets)

fun catalogImageAspectRatio(kind: CatalogKind): Float = when (kind) {
    CatalogKind.GACHA -> 61f / 26f
    CatalogKind.HONOR -> 4.75f
    CatalogKind.COMIC -> 1.8f
    else -> 1f
}

internal fun nextCandidateIndex(current: Int, lastIndex: Int): Int? = (current + 1).takeIf { it <= lastIndex }

@Composable
fun BackendImage(
    candidates: List<String?>,
    contentDescription: String?,
    cacheKey: String,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    showProgress: Boolean = false
) {
    var retryToken by remember { mutableIntStateOf(0) }
    val sourceKey = remember(candidates) { orderedImageCandidates(candidates).joinToString("|") }
    val urls = remember(candidates, retryToken) {
        val all = orderedImageCandidates(candidates)
        val now = System.currentTimeMillis()
        val available = all.filter { url -> failedSources[url]?.let { now - it >= FAILED_SOURCE_TTL_MILLIS } != false }
        (listOfNotNull(successfulSources[sourceKey]) + available.ifEmpty { all }).distinct()
    }
    var index by remember(urls) { mutableIntStateOf(0) }
    var loading by remember(urls) { mutableStateOf(urls.isNotEmpty()) }
    var failed by remember(urls) { mutableStateOf(urls.isEmpty()) }
    LaunchedEffect(urls) {
        index = 0
        loading = urls.isNotEmpty()
        failed = urls.isEmpty()
    }

    Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
        if (loading && showProgress) CircularProgressIndicator(Modifier.padding(16.dp))
        if (failed) {
            androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Outlined.BrokenImage, contentDescription = null)
                Text(stringResource(R.string.backend_image_missing), style = MaterialTheme.typography.labelMedium)
                IconButton(onClick = {
                    orderedImageCandidates(candidates).forEach(failedSources::remove)
                    retryToken++
                }) { Icon(Icons.Outlined.Refresh, stringResource(R.string.backend_image_retry)) }
            }
        }
        urls.getOrNull(index)?.let { url ->
            val request = ImageRequest.Builder(LocalContext.current)
                .data(url)
                .memoryCacheKey("$cacheKey:${url.hashCode()}")
                .diskCacheKey("$cacheKey:${url.hashCode()}")
                .build()
            AsyncImage(
                model = request,
                contentDescription = contentDescription,
                modifier = Modifier.fillMaxSize(),
                contentScale = contentScale,
                onLoading = { loading = true; failed = false },
                onSuccess = { successfulSources[sourceKey] = url; failedSources.remove(url); loading = false; failed = false },
                onError = {
                    failedSources[url] = System.currentTimeMillis()
                    nextCandidateIndex(index, urls.lastIndex)?.let { index = it }
                        ?: run { loading = false; failed = true }
                }
            )
        }
    }
}
