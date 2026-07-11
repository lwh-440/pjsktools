package com.pjsktools.app

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AssistantScreen()
                }
            }
        }
    }
}

@Composable
fun AssistantScreen(api: ApiClient = ApiClient()) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("pjsktools", Context.MODE_PRIVATE) }
    val scope = rememberCoroutineScope()

    var region by remember { mutableStateOf("jp") }
    var playerId by remember { mutableStateOf("123456789") }
    var email by remember { mutableStateOf(prefs.getString("email", "demo@example.com") ?: "demo@example.com") }
    var password by remember { mutableStateOf("password123") }
    var token by remember { mutableStateOf(prefs.getString("token", "").orEmpty()) }
    var activeTab by remember { mutableStateOf("总览") }

    var regions by remember { mutableStateOf<List<Region>>(emptyList()) }
    var songs by remember { mutableStateOf<List<Song>>(emptyList()) }
    var cards by remember { mutableStateOf<List<SekaiCard>>(emptyList()) }
    var event by remember { mutableStateOf<EventInfo?>(null) }
    var profile by remember { mutableStateOf<PlayerProfile?>(null) }
    var rankings by remember { mutableStateOf<List<RankingEntry>>(emptyList()) }
    var borders by remember { mutableStateOf<List<RankingBorder>>(emptyList()) }
    var favorites by remember { mutableStateOf<List<Favorite>>(emptyList()) }
    var scores by remember { mutableStateOf<List<ScoreRecord>>(emptyList()) }
    var status by remember { mutableStateOf("准备连接后端") }

    fun refreshUserData() {
        if (token.isBlank()) return
        scope.launch {
            runCatching {
                favorites = api.favorites(token)
                scores = api.scores(token)
            }.onFailure {
                status = "同步个人数据失败：${it.message}"
            }
        }
    }

    fun refreshRegionData(nextRegion: String = region) {
        scope.launch {
            status = "正在从后端加载 $nextRegion 静态数据"
            runCatching {
                if (regions.isEmpty()) regions = api.regions()
                songs = api.songs(nextRegion)
                cards = api.cards(nextRegion)
                event = api.currentEvent(nextRegion)
                event?.let {
                    rankings = api.rankingTop100(nextRegion, it.id)
                    borders = api.rankingBorder(nextRegion, it.id)
                }
                status = "已连接：${songs.size} 首歌曲，${cards.size} 张卡牌"
            }.onFailure {
                status = "无法连接后端：${it.message}"
            }
        }
    }

    LaunchedEffect(region) {
        refreshRegionData(region)
    }

    LaunchedEffect(token) {
        refreshUserData()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Header(status = status, token = token, email = email, onLogout = {
                token = ""
                prefs.edit().remove("token").remove("email").apply()
                favorites = emptyList()
                scores = emptyList()
                status = "已退出登录"
            })
        }

        item {
            TabBar(activeTab = activeTab, onSelect = { activeTab = it })
        }

        item {
            RegionPicker(regions = regions, selected = region) {
                region = it
            }
        }

        when (activeTab) {
            "账号" -> item {
                AccountCard(
                    email = email,
                    password = password,
                    token = token,
                    onEmailChange = { email = it },
                    onPasswordChange = { password = it },
                    onLogin = {
                        scope.launch {
                            runCatching { api.login(email, password) }
                                .recoverCatching { api.register(email, password) }
                                .onSuccess { session ->
                                    token = session.token
                                    email = session.email
                                    prefs.edit().putString("token", session.token).putString("email", session.email).apply()
                                    status = "账号已同步"
                                    refreshUserData()
                                }
                                .onFailure { status = "登录失败：${it.message}" }
                        }
                    }
                )
            }

            "个人" -> {
                item {
                    ProfileCard(
                        playerId = playerId,
                        profile = profile,
                        onPlayerIdChange = { playerId = it },
                        onSearch = {
                            scope.launch {
                                runCatching { api.profile(region, playerId) }
                                    .onSuccess {
                                        profile = it
                                        status = "玩家档案已更新"
                                    }
                                    .onFailure { status = "查询失败：${it.message}" }
                            }
                        },
                        onFavorite = {
                            val current = profile
                            if (current == null) {
                                status = "请先查询玩家档案"
                            } else if (token.isBlank()) {
                                status = "请先登录后再收藏"
                            } else {
                                scope.launch {
                                    runCatching { api.addFavorite(token, region, current.userId, current.nickname) }
                                        .onSuccess {
                                            status = "已收藏 ${current.nickname}"
                                            refreshUserData()
                                        }
                                        .onFailure { status = "收藏失败：${it.message}" }
                                }
                            }
                        }
                    )
                }
                item {
                    FavoritesCard(favorites = favorites)
                }
            }

            "歌曲" -> item {
                SongsCard(songs = songs)
            }

            "卡牌" -> item {
                CardsCard(cards = cards)
            }

            "成绩" -> {
                item {
                    ScoreActionCard(
                        token = token,
                        firstSong = songs.firstOrNull(),
                        onAdd = {
                            val song = songs.firstOrNull()
                            if (song == null) {
                                status = "暂无歌曲可记录"
                            } else if (token.isBlank()) {
                                status = "请先登录后再记录成绩"
                            } else {
                                scope.launch {
                                    runCatching { api.addScore(token, region, song.id, 987654) }
                                        .onSuccess {
                                            status = "成绩已记录"
                                            refreshUserData()
                                        }
                                        .onFailure { status = "记录失败：${it.message}" }
                                }
                            }
                        }
                    )
                }
                item {
                    ScoresCard(scores = scores)
                }
            }

            else -> {
                item {
                    EventCard(event = event, borders = borders, rankings = rankings)
                }
                item {
                    DataSummaryCard(songs = songs, cards = cards)
                }
            }
        }
    }
}

@Composable
private fun Header(status: String, token: String, email: String, onLogout: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("PJSK 玩家助手", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(status)
            if (token.isNotBlank()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("已登录：$email", modifier = Modifier.weight(1f))
                    TextButton(onClick = onLogout) { Text("退出") }
                }
            }
        }
    }
}

@Composable
private fun TabBar(activeTab: String, onSelect: (String) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(listOf("总览", "歌曲", "卡牌", "个人", "成绩", "账号")) { tab ->
            Button(onClick = { onSelect(tab) }, enabled = activeTab != tab) {
                Text(tab)
            }
        }
    }
}

@Composable
private fun RegionPicker(regions: List<Region>, selected: String, onSelect: (String) -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("区服", style = MaterialTheme.typography.titleMedium)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(regions.ifEmpty { listOf(Region("jp", "日服")) }) { item ->
                    Button(onClick = { onSelect(item.id) }, enabled = selected != item.id) {
                        Text(item.name)
                    }
                }
            }
        }
    }
}

@Composable
private fun AccountCard(
    email: String,
    password: String,
    token: String,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onLogin: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("账号同步", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(value = email, onValueChange = onEmailChange, label = { Text("邮箱") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = password, onValueChange = onPasswordChange, label = { Text("密码") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = onLogin, enabled = token.isBlank()) {
                Text(if (token.isBlank()) "登录 / 自动注册" else "已登录")
            }
        }
    }
}

@Composable
private fun ProfileCard(
    playerId: String,
    profile: PlayerProfile?,
    onPlayerIdChange: (String) -> Unit,
    onSearch: () -> Unit,
    onFavorite: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("玩家档案查询", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(value = playerId, onValueChange = onPlayerIdChange, label = { Text("玩家 ID") }, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onSearch) { Text("查询") }
                Button(onClick = onFavorite, enabled = profile != null) { Text("收藏玩家") }
            }
            profile?.let {
                Divider()
                Text("${it.nickname} / Rank ${it.rank}", fontWeight = FontWeight.Bold)
                Text(it.comment)
            }
        }
    }
}

@Composable
private fun EventCard(event: EventInfo?, borders: List<RankingBorder>, rankings: List<RankingEntry>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("当前活动", style = MaterialTheme.typography.titleMedium)
            Text(event?.name ?: "暂无活动数据", fontWeight = FontWeight.Bold)
            Text(event?.eventType ?: "")
            Divider()
            Text("分数线")
            borders.forEach { Text("Top ${it.rank}: ${it.score}") }
            Divider()
            Text("排名预览")
            rankings.take(5).forEach {
                Text("#${it.rank} ${it.name} / ${it.score}")
            }
        }
    }
}

@Composable
private fun DataSummaryCard(songs: List<Song>, cards: List<SekaiCard>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Team-Haruki 静态数据", style = MaterialTheme.typography.titleMedium)
            Text("歌曲：${songs.size} 首")
            Text("卡牌：${cards.size} 张")
            Text("数据来自后端缓存的 Team-Haruki master JSON。首次加载可能稍慢。")
        }
    }
}

@Composable
private fun SongsCard(songs: List<Song>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("歌曲与谱面（${songs.size}）", style = MaterialTheme.typography.titleMedium)
            songs.take(80).forEach { song ->
                Text(song.title, fontWeight = FontWeight.Bold)
                Text("${song.unit} · ${song.difficulties.joinToString(" / ")}")
                Divider()
            }
        }
    }
}

@Composable
private fun CardsCard(cards: List<SekaiCard>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("卡牌资料（${cards.size}）", style = MaterialTheme.typography.titleMedium)
            cards.take(120).forEach { card ->
                Text("${card.character} · ${card.title}", fontWeight = FontWeight.Bold)
                Text("★${card.rarity} · ${card.attribute} · ${card.assetbundleName ?: "无资源名"}")
                Divider()
            }
        }
    }
}

@Composable
private fun FavoritesCard(favorites: List<Favorite>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("我的收藏", style = MaterialTheme.typography.titleMedium)
            if (favorites.isEmpty()) {
                Text("还没有收藏。")
            } else {
                favorites.forEach { Text("${it.label} · ${it.region} · ${it.targetId}") }
            }
        }
    }
}

@Composable
private fun ScoreActionCard(token: String, firstSong: Song?, onAdd: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("成绩目标", style = MaterialTheme.typography.titleMedium)
            Text(firstSong?.let { "将为 ${it.title} 添加一条 Expert FC 示例成绩。" } ?: "暂无歌曲可记录。")
            Button(onClick = onAdd, enabled = token.isNotBlank() && firstSong != null) {
                Text("记录示例成绩")
            }
        }
    }
}

@Composable
private fun ScoresCard(scores: List<ScoreRecord>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("我的成绩", style = MaterialTheme.typography.titleMedium)
            if (scores.isEmpty()) {
                Text("还没有成绩记录。")
            } else {
                scores.forEach {
                    Text("${it.songId} · ${it.difficulty} · ${it.clearStatus} · ${it.score}/${it.targetScore ?: 0}")
                }
            }
        }
    }
}
