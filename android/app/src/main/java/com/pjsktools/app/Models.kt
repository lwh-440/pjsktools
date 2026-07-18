package com.pjsktools.app

data class Region(val id: String, val name: String)

data class Song(
    val id: String,
    val title: String,
    val unit: String,
    val difficulties: List<String>
)

data class SekaiCard(
    val id: String,
    val character: String,
    val title: String,
    val rarity: Int,
    val attribute: String,
    val assetbundleName: String?
)

data class EventInfo(
    val id: String,
    val name: String,
    val eventType: String,
    val startAt: String,
    val endAt: String,
    val region: String
)

data class PlayerProfile(
    val region: String,
    val userId: String,
    val nickname: String,
    val rank: Int,
    val comment: String
)

data class RankingEntry(
    val rank: Int,
    val userId: String,
    val name: String,
    val score: Int
)

data class RankingBorder(val rank: Int, val score: Int)

data class Favorite(
    val id: String,
    val type: String,
    val region: String,
    val targetId: String,
    val label: String
)

data class ScoreRecord(
    val id: String,
    val region: String,
    val songId: String,
    val difficulty: String,
    val clearStatus: String,
    val score: Int,
    val targetScore: Int?,
    val note: String?
)

data class Session(val token: String, val email: String)
