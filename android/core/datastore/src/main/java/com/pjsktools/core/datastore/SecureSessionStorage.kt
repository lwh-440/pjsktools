package com.pjsktools.core.datastore

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.pjsktools.core.model.AccountSession
import com.pjsktools.core.model.AccountUser
import com.pjsktools.core.model.SessionStorage
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

private val Context.sessionDataStore by preferencesDataStore("secure_session")

@Singleton
class KeystoreSessionStorage @Inject constructor(
    @ApplicationContext private val context: Context
) : SessionStorage {
    private val sessionKey = stringPreferencesKey("encrypted_account_session")
    private val alias = "pjsktools-account-session-v1"

    override val session: Flow<AccountSession?> = context.sessionDataStore.data.map { preferences ->
        preferences[sessionKey]?.let(::decryptSession)
    }

    override suspend fun current(): AccountSession? = session.first()

    override suspend fun save(session: AccountSession) {
        context.sessionDataStore.edit { it[sessionKey] = encryptSession(session) }
    }

    override suspend fun clear() {
        context.sessionDataStore.edit { it.remove(sessionKey) }
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build()
            )
            generateKey()
        }
    }

    private fun encryptSession(session: AccountSession): String {
        val payload = JSONObject()
            .put("accessToken", session.accessToken)
            .put("refreshToken", session.refreshToken)
            .put("expiresAtMillis", session.expiresAtMillis)
            .put("userId", session.user.id)
            .put("email", session.user.email)
            .put("nickname", session.user.nickname)
            .put("avatarUrl", session.user.avatarUrl)
            .toString()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(payload.toByteArray(Charsets.UTF_8))
        return "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(encrypted, Base64.NO_WRAP)}"
    }

    private fun decryptSession(value: String): AccountSession? = runCatching {
        val (iv, encrypted) = value.split(":", limit = 2)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
        )
        val json = JSONObject(String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8))
        AccountSession(
            accessToken = json.getString("accessToken"),
            refreshToken = json.getString("refreshToken"),
            expiresAtMillis = json.getLong("expiresAtMillis"),
            user = AccountUser(
                id = json.getString("userId"),
                email = json.optString("email").takeIf { it.isNotBlank() && it != "null" },
                nickname = json.optString("nickname").takeIf { it.isNotBlank() && it != "null" },
                avatarUrl = json.optString("avatarUrl").takeIf { it.isNotBlank() && it != "null" }
            )
        )
    }.getOrNull()
}

@Module
@InstallIn(SingletonComponent::class)
abstract class SessionStorageBindings {
    @Binds abstract fun bindSessionStorage(impl: KeystoreSessionStorage): SessionStorage
}
