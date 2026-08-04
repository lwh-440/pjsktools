package com.pjsktools.app.feature.account

import com.pjsktools.core.database.PublicDataDao

interface PrivateAccountCacheCleaner {
    suspend fun clearForAccount(accountId: String)
}

internal class PrivateAccountCacheCoordinator(
    private val clearRoom: suspend (String) -> Unit,
    private val clearHarukiPreview: suspend (String) -> Unit
) : PrivateAccountCacheCleaner {
    override suspend fun clearForAccount(accountId: String) {
        require(accountId.isNotBlank()) { "无法确认当前账号，未清除任何本机私有数据" }
        clearRoom(accountId)
        clearHarukiPreview(accountId)
    }
}

fun androidPrivateAccountCacheCleaner(
    dao: PublicDataDao,
    harukiPreviewCache: HarukiPreviewCache
): PrivateAccountCacheCleaner = PrivateAccountCacheCoordinator(
    clearRoom = dao::clearPrivateAccount,
    clearHarukiPreview = harukiPreviewCache::clearAllForUser
)
