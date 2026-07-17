package com.pjsktools.core.model

import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class ScrollAnchorStore(private val limit: Int = 24, encoded: List<String> = emptyList()) {
    private val anchors = LinkedHashMap<String, ListScrollAnchor>()

    init {
        encoded.forEach { row ->
            val parts = row.split('\t')
            if (parts.size == 4) anchors[decode(parts[0])] = ListScrollAnchor(decode(parts[1]).ifEmpty { null }, parts[2].toIntOrNull() ?: 0, parts[3].toIntOrNull() ?: 0)
        }
    }

    fun get(key: String): ListScrollAnchor? = anchors[key]?.also {
        anchors.remove(key)
        anchors[key] = it
    }

    fun put(key: String, anchor: ListScrollAnchor): List<String> {
        anchors.remove(key)
        anchors[key] = anchor
        while (anchors.size > limit) anchors.remove(anchors.keys.first())
        return encoded()
    }

    fun encoded(): List<String> = anchors.map { (key, anchor) ->
        listOf(encode(key), encode(anchor.itemId ?: ""), anchor.index.toString(), anchor.offset.toString()).joinToString("\t")
    }

    private fun encode(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
    private fun decode(value: String) = URLDecoder.decode(value, StandardCharsets.UTF_8.toString())
}

fun SongQuery.scrollKey(region: Region): String = listOf(region.id, "songs", text.trim().lowercase(), sort, unit ?: "", category ?: "", filters.stableKey(), page.toString()).joinToString("|")
fun CardQuery.scrollKey(region: Region): String = listOf(region.id, "cards", text.trim().lowercase(), sort, characterId?.toString() ?: "", attribute ?: "", rarity ?: "", unit ?: "", filters.stableKey(), page.toString()).joinToString("|")
fun CatalogQuery.scrollKey(region: Region, kind: CatalogKind): String = listOf(region.id, kind.apiName, text.trim().lowercase(), sort, category ?: "", rarity ?: "", characterId?.toString() ?: "", partType ?: "", source ?: "", gender ?: "", filters.stableKey(), page.toString()).joinToString("|")

private fun CatalogFilterState.stableKey(): String {
    val selectedKey = selected.toSortedMap().entries.joinToString(";") { (key, values) ->
        "$key=${values.sorted().joinToString(",")}"
    }
    val toggleKey = toggles.toSortedMap().entries.joinToString(";") { (key, value) -> "$key=$value" }
    return "$selectedKey#$toggleKey"
}
