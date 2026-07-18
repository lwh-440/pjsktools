package com.pjsktools.app.feature.shell

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

@Composable
fun DeckCompareFeatureScreen(
    baseUrl: String,
    region: String,
    cachePolicy: ShellCachePolicy,
    account: DeckCompareAccountContext?,
    onOpenAccount: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val repository = remember(baseUrl, region, cachePolicy) {
        ShellRepository(baseUrl, cachePolicy, context.cacheDir.resolve("shell/$region"))
    }
    var form by remember(region) { mutableStateOf(DeckCompareForm()) }
    var candidates by remember(region) {
        mutableStateOf(listOf(defaultCandidate(1), defaultCandidate(2)))
    }
    var request by remember { mutableStateOf<CompareRequest?>(null) }
    var result by remember { mutableStateOf<DeckCompareResult?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var history by remember { mutableStateOf(loadHistory(context)) }

    LaunchedEffect(repository, request) {
        val target = request ?: return@LaunchedEffect
        loading = true
        error = null
        try {
            val compared = repository.compareDecks(target.region, target.form, target.candidates, target.account)
            result = compared
            val item = DeckCompareHistoryItem(
                id = System.currentTimeMillis().toString(), createdAt = Instant.now().toString(),
                region = target.region, musicId = target.form.musicId,
                difficulty = target.form.difficulty, scoreMode = target.form.scoreMode,
                candidates = target.candidates.map { it.name.ifBlank { it.id } },
                winnerByScore = compared.winnerByScore,
                winnerByEventPoint = compared.winnerByEventPoint,
                scoreDelta = compared.scoreDelta, eventPointDelta = compared.eventPointDelta
            )
            history = (listOf(item) + history).take(30)
            saveHistory(context, history)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            error = e.message ?: "卡组比较失败"
        } finally {
            loading = false
        }
    }

    LazyColumn(modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("卡组比较", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("比较 2-5 个卡组方案的多人 Live 分数与活动 PT；登录态可引用当前 UID 的保存卡组。")
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MetricCard("区服", region.uppercase(), Modifier.weight(1f))
                    MetricCard("模式", form.scoreMode, Modifier.weight(1f))
                    MetricCard("保存卡组", account?.savedDecks?.size?.toString() ?: "0", Modifier.weight(1f))
                    MetricCard("方案", candidates.size.toString(), Modifier.weight(1f))
                }
                if (account == null) TextButton(onClick = onOpenAccount) { Text("登录后使用保存卡组") }
                else Text("当前绑定：${account.region.uppercase()} / ${account.bindingId}", style = MaterialTheme.typography.bodySmall)
            }
        }
        item {
            ShellCard("Live 参数", "公开模式使用页面区服；保存卡组严格使用绑定区服。") {
                Field(form.musicId, { form = form.copy(musicId = it) }, "歌曲 ID")
                ChoiceRow("难度", listOf("easy", "normal", "hard", "expert", "master", "append"), form.difficulty) { form = form.copy(difficulty = it) }
                ChoiceRow("Live", listOf("multi", "cheerful"), form.liveType) { form = form.copy(liveType = it) }
                ChoiceRow("计分", listOf("aggregate", "exact"), form.scoreMode) { form = form.copy(scoreMode = it) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field(form.boost, { form = form.copy(boost = it) }, "火量 0-10", Modifier.weight(1f))
                    Field(form.eventBonusPercent, { form = form.copy(eventBonusPercent = it) }, "活动加成 %", Modifier.weight(1f))
                }
                ChoiceRow("Skill 1-5", listOf("expected", "best", "worst"), form.skill15Strategy) { form = form.copy(skill15Strategy = it) }
                ChoiceRow("Skill 6", listOf("team-average", "highest-power"), form.skill6Mode) { form = form.copy(skill6Mode = it) }
                if (form.scoreMode == "exact") {
                    Field(form.exactSkills, { form = form.copy(exactSkills = it) }, "Exact 技能值（1-6 个，以逗号分隔）")
                }
                Text("四名队友统一参数", fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field(form.teammatePower, { form = form.copy(teammatePower = it) }, "队友综合力", Modifier.weight(1f))
                    Field(form.teammateEffectiveness, { form = form.copy(teammateEffectiveness = it) }, "队友技能值", Modifier.weight(1f))
                }
            }
        }
        item {
            ShellCard("比较方案", "手动综合力、Card IDs 与登录态保存卡组可混合比较。") {
                candidates.forEachIndexed { index, candidate ->
                    CandidateEditor(
                        index = index, candidate = candidate, savedDecks = account?.savedDecks.orEmpty(),
                        allowSaved = account != null && account.region == region,
                        canRemove = candidates.size > 2,
                        onChange = { next -> candidates = candidates.map { if (it.id == next.id) next else it } },
                        onRemove = { candidates = candidates.filterNot { it.id == candidate.id } }
                    )
                    if (index < candidates.lastIndex) HorizontalDivider()
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { candidates = candidates + defaultCandidate(candidates.size + 1) },
                        enabled = candidates.size < 5
                    ) { Text("新增方案") }
                    Button(
                        onClick = { request = CompareRequest(region, form, candidates, account) },
                        enabled = !loading && form.musicId.isNotBlank() && candidates.size in 2..5
                    ) { Text(if (loading) "比较中" else "运行比较") }
                    TextButton(onClick = { result = null; error = null }) { Text("清空结果") }
                }
            }
        }
        error?.let { item { ErrorCard(it) { request = CompareRequest(region, form, candidates, account) } } }
        result?.let { compared -> item { DeckResultCard(compared) } }
        item {
            ShellCard("本地比较历史", "仅保存在当前设备，不写入服务器。") {
                TextButton(onClick = { history = emptyList(); saveHistory(context, history) }, enabled = history.isNotEmpty()) { Text("清空历史") }
                if (history.isEmpty()) Text("暂无本地比较历史。")
                history.forEach { item ->
                    Text("${item.createdAt} · ${item.region.uppercase()} · ${item.musicId}/${item.difficulty}", style = MaterialTheme.typography.bodySmall)
                    Text(item.candidates.joinToString(" vs "), fontWeight = FontWeight.SemiBold)
                    Text("Score: ${item.winnerByScore ?: "-"} · PT: ${item.winnerByEventPoint ?: "-"} · Δ ${number(item.scoreDelta)} / ${number(item.eventPointDelta)}")
                    TextButton(onClick = {
                        history = history.filterNot { it.id == item.id }
                        saveHistory(context, history)
                    }) { Text("删除") }
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun CandidateEditor(
    index: Int,
    candidate: DeckCompareCandidateDraft,
    savedDecks: List<SavedDeckOption>,
    allowSaved: Boolean,
    canRemove: Boolean,
    onChange: (DeckCompareCandidateDraft) -> Unit,
    onRemove: () -> Unit
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(candidate.name.ifBlank { "方案 ${index + 1}" }, fontWeight = FontWeight.Bold)
        TextButton(onClick = onRemove, enabled = canRemove) { Text("删除") }
    }
    Field(candidate.name, { onChange(candidate.copy(name = it)) }, "方案名称")
    val modes = if (allowSaved) DeckCandidateMode.entries else DeckCandidateMode.entries.filterNot { it == DeckCandidateMode.SAVED }
    Text("输入来源", fontWeight = FontWeight.SemiBold)
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        modes.forEach { mode ->
            if (mode == candidate.mode) Button(onClick = {}) { Text(mode.label) }
            else OutlinedButton(onClick = { onChange(candidate.copy(mode = mode)) }) { Text(mode.label) }
        }
    }
    when (candidate.mode) {
        DeckCandidateMode.MANUAL -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field(candidate.power, { onChange(candidate.copy(power = it)) }, "综合力", Modifier.weight(1f))
            Field(candidate.effectiveness, { onChange(candidate.copy(effectiveness = it)) }, "技能值", Modifier.weight(1f))
        }
        DeckCandidateMode.CARDS -> Field(candidate.cardIds, { onChange(candidate.copy(cardIds = it)) }, "Card IDs（1-5 个）")
        DeckCandidateMode.SAVED -> {
            if (!allowSaved) Text("保存卡组要求登录且绑定区服与页面区服一致。", color = MaterialTheme.colorScheme.error)
            else {
                Text("选择保存卡组", fontWeight = FontWeight.SemiBold)
                savedDecks.forEach { deck ->
                    val selected = deck.id == candidate.deckConfigId
                    if (selected) Button(onClick = {}) { Text("${deck.name} · ${deck.cardIds.size} 张") }
                    else OutlinedButton(onClick = { onChange(candidate.copy(deckConfigId = deck.id)) }) { Text("${deck.name} · ${deck.cardIds.size} 张") }
                }
                if (savedDecks.isEmpty()) Text("当前绑定没有保存卡组。")
            }
        }
    }
}

@Composable
private fun DeckResultCard(result: DeckCompareResult) {
    ShellCard("比较结果", "${result.multiLiveVersion ?: "-"} · ${result.liveExactVersion ?: result.scoreMode ?: "-"}") {
        Text("公式：${result.formulaId ?: "Deck Comparator"}")
        Text("分数胜出：${result.winnerByScore ?: "-"} · PT 胜出：${result.winnerByEventPoint ?: "-"}")
        Text("分数差：${number(result.scoreDelta)} · PT 差：${number(result.eventPointDelta)}")
        result.comparisons.forEach { item ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(item.name, fontWeight = FontWeight.Bold)
                    Text("来源 ${item.source ?: "-"} · 状态 ${item.status ?: if (item.missingFields.isEmpty()) "ok" else "missing-data"}")
                    Text("综合力 ${number(item.power)} · 技能值 ${number(item.effectiveness)}")
                    Text("分数 ${number(item.score)} · 活动 PT ${number(item.eventPoint)}")
                    if (item.missingFields.isNotEmpty()) Text("缺失：${item.missingFields.joinToString()}", color = MaterialTheme.colorScheme.error)
                }
            }
        }
        if (result.traceSummary.isNotEmpty()) {
            Text("Exact Trace", fontWeight = FontWeight.Bold)
            result.traceSummary.forEach { (label, value) -> Text("$label: $value") }
        }
        Text("缺失字段：${result.missingFields.ifEmpty { listOf("无") }.joinToString()}")
        Text("估算字段：${result.estimatedFields.ifEmpty { listOf("无") }.joinToString()}")
    }
}

@Composable
private fun ChoiceRow(label: String, options: List<String>, selected: String, onSelect: (String) -> Unit) {
    Text(label, fontWeight = FontWeight.SemiBold)
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { option ->
            if (option == selected) Button(onClick = {}) { Text(option) }
            else OutlinedButton(onClick = { onSelect(option) }) { Text(option) }
        }
    }
}

@Composable
private fun Field(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier.fillMaxWidth()) {
    OutlinedTextField(value = value, onValueChange = onChange, label = { Text(label) }, modifier = modifier, singleLine = true)
}

@Composable
private fun MetricCard(label: String, value: String, modifier: Modifier) {
    Card(modifier) { Column(Modifier.padding(8.dp)) { Text(label, style = MaterialTheme.typography.labelSmall); Text(value, fontWeight = FontWeight.Bold) } }
}

private data class CompareRequest(
    val region: String,
    val form: DeckCompareForm,
    val candidates: List<DeckCompareCandidateDraft>,
    val account: DeckCompareAccountContext?
)

private fun defaultCandidate(index: Int) = DeckCompareCandidateDraft(
    id = "c${System.nanoTime()}-$index", name = "方案 $index", power = "280000", effectiveness = "250"
)

private const val historyPrefs = "pjsktools-shell"
private const val historyKey = "deck-compare-history-v1"

private fun loadHistory(context: Context): List<DeckCompareHistoryItem> = runCatching {
    val raw = context.getSharedPreferences(historyPrefs, Context.MODE_PRIVATE).getString(historyKey, "[]") ?: "[]"
    val array = JSONArray(raw)
    List(array.length()) { index -> array.getJSONObject(index).toHistory() }
}.getOrDefault(emptyList())

private fun saveHistory(context: Context, items: List<DeckCompareHistoryItem>) {
    val array = JSONArray(items.map { item -> JSONObject()
        .put("id", item.id).put("createdAt", item.createdAt).put("region", item.region)
        .put("musicId", item.musicId).put("difficulty", item.difficulty).put("scoreMode", item.scoreMode)
        .put("candidates", JSONArray(item.candidates)).put("winnerByScore", item.winnerByScore)
        .put("winnerByEventPoint", item.winnerByEventPoint).put("scoreDelta", item.scoreDelta)
        .put("eventPointDelta", item.eventPointDelta) })
    context.getSharedPreferences(historyPrefs, Context.MODE_PRIVATE).edit().putString(historyKey, array.toString()).apply()
}

private fun JSONObject.toHistory() = DeckCompareHistoryItem(
    id = optString("id"), createdAt = optString("createdAt"), region = optString("region"),
    musicId = optString("musicId"), difficulty = optString("difficulty"), scoreMode = optString("scoreMode"),
    candidates = optJSONArray("candidates")?.let { array -> List(array.length()) { array.optString(it) } }.orEmpty(),
    winnerByScore = optString("winnerByScore").takeIf(String::isNotBlank),
    winnerByEventPoint = optString("winnerByEventPoint").takeIf(String::isNotBlank),
    scoreDelta = if (has("scoreDelta") && !isNull("scoreDelta")) optDouble("scoreDelta") else null,
    eventPointDelta = if (has("eventPointDelta") && !isNull("eventPointDelta")) optDouble("eventPointDelta") else null
)

private fun number(value: Double?): String = value?.let { if (it % 1.0 == 0.0) it.toLong().toString() else "%.2f".format(it) } ?: "-"
