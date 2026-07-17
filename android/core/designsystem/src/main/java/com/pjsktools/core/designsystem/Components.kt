package com.pjsktools.core.designsystem

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pjsktools.core.model.ContentPhase
import com.pjsktools.core.model.DataResult

@Composable
fun <T> ResultContent(result: DataResult<T>, modifier: Modifier = Modifier, onRetry: (() -> Unit)? = null, content: @Composable (T) -> Unit) {
    Box(modifier.fillMaxSize()) {
        result.data?.let { data -> content(data) }
        if (result.data == null) {
            when (result.phase) {
                ContentPhase.LOADING, ContentPhase.REFRESHING -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                else -> StateMessage(result.phase, result.message, onRetry, Modifier.align(Alignment.Center))
            }
        }
        if (result.data != null && result.phase in setOf(ContentPhase.STALE, ContentPhase.OFFLINE, ContentPhase.PARTIAL)) {
            AssistChip(onClick = {}, label = { Text(result.message ?: phaseLabel(result.phase)) }, modifier = Modifier.align(Alignment.TopCenter).padding(8.dp))
        }
    }
}

@Composable
fun StateMessage(phase: ContentPhase, message: String?, onRetry: (() -> Unit)?, modifier: Modifier = Modifier) {
    Column(modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(if (phase == ContentPhase.OFFLINE) Icons.Outlined.CloudOff else if (phase == ContentPhase.EMPTY) Icons.Outlined.HourglassEmpty else Icons.Outlined.ErrorOutline, contentDescription = null)
        Text(message ?: phaseLabel(phase), style = MaterialTheme.typography.bodyLarge)
        onRetry?.let { Button(onClick = it) { Text("重试") } }
    }
}

fun phaseLabel(phase: ContentPhase) = when (phase) {
    ContentPhase.LOADING -> "正在加载"; ContentPhase.CONTENT -> "数据已更新"; ContentPhase.EMPTY -> "暂无数据"; ContentPhase.REFRESHING -> "正在刷新"
    ContentPhase.STALE -> "正在显示过期缓存"; ContentPhase.OFFLINE -> "离线缓存"; ContentPhase.PARTIAL -> "部分数据可用"; ContentPhase.UNAVAILABLE -> "当前区服暂不可用"; ContentPhase.ERROR -> "加载失败"
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) { Text(text, style = MaterialTheme.typography.titleMedium, modifier = modifier.padding(vertical = 8.dp)) }
