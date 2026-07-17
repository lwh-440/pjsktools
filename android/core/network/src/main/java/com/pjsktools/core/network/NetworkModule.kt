package com.pjsktools.core.network

import retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.pjsktools.api.generated.AndroidApi
import com.pjsktools.core.model.ApiEnvironment
import com.pjsktools.core.common.AppDispatchers
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.modules.SerializersModule
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Dispatcher
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Converter
import retrofit2.Retrofit
import java.lang.reflect.Type
import java.math.BigDecimal
import java.util.concurrent.TimeUnit
import javax.inject.Qualifier
import javax.inject.Singleton

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ImageHttpClient

internal fun isAllowedBackendUrl(backend: okhttp3.HttpUrl, candidate: okhttp3.HttpUrl): Boolean =
    candidate.scheme == backend.scheme && candidate.host == backend.host && candidate.port == backend.port

@Module @InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton fun dispatchers(): AppDispatchers = AppDispatchers()
    @Provides @Singleton fun json(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        serializersModule = SerializersModule {
            contextual(BigDecimal::class, BigDecimalSerializer)
        }
    }
    @Provides @Singleton @RawHttpClient fun rawOkHttp(environment: ApiEnvironment): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS)
        .apply { if (environment.buildType == "debug") addInterceptor(HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC)) }
        .build()
    @Provides @Singleton @RawAndroidApi fun rawGeneratedApi(environment: ApiEnvironment, @RawHttpClient client: OkHttpClient, json: Json): AndroidApi = Retrofit.Builder()
        .baseUrl(environment.apiBaseUrl).client(client)
        .addConverterFactory(GeneratedEnumStringConverterFactory)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build().create(AndroidApi::class.java)
    @Provides @Singleton fun okHttp(@RawHttpClient client: OkHttpClient, authInterceptor: SessionAuthInterceptor): OkHttpClient =
        client.newBuilder().addInterceptor(authInterceptor).build()
    @Provides @Singleton @ImageHttpClient fun imageHttpClient(environment: ApiEnvironment, @RawHttpClient client: OkHttpClient): OkHttpClient {
        val backend = environment.apiBaseUrl.toHttpUrl()
        val dispatcher = Dispatcher().apply { maxRequests = 16; maxRequestsPerHost = 8 }
        return client.newBuilder()
            .dispatcher(dispatcher)
            .connectTimeout(4, TimeUnit.SECONDS)
            .readTimeout(7, TimeUnit.SECONDS)
            .callTimeout(7, TimeUnit.SECONDS)
            .addInterceptor { chain ->
            val requestUrl = chain.request().url
            check(isAllowedBackendUrl(backend, requestUrl)) {
                "Blocked image request outside the configured backend"
            }
            chain.proceed(chain.request())
        }.build()
    }
    @Provides @Singleton fun generatedApi(environment: ApiEnvironment, client: OkHttpClient, json: Json): AndroidApi = Retrofit.Builder()
        .baseUrl(environment.apiBaseUrl).client(client)
        .addConverterFactory(GeneratedEnumStringConverterFactory)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build().create(AndroidApi::class.java)
    @Provides @Singleton fun api(generated: AndroidApi, json: Json): ApiContractAdapter = GeneratedApiBridge(generated, json)
}

private object BigDecimalSerializer : KSerializer<BigDecimal> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("BigDecimal", PrimitiveKind.DOUBLE)

    override fun serialize(encoder: Encoder, value: BigDecimal) = encoder.encodeDouble(value.toDouble())

    override fun deserialize(decoder: Decoder): BigDecimal = decoder.decodeDouble().toBigDecimal()
}

internal object GeneratedEnumStringConverterFactory : Converter.Factory() {
    override fun stringConverter(
        type: Type,
        annotations: Array<out Annotation>,
        retrofit: Retrofit
    ): Converter<*, String>? {
        val rawType = getRawType(type)
        if (!rawType.isEnum) return null
        val valueGetter = rawType.methods.firstOrNull { method ->
            method.name == "getValue" && method.parameterCount == 0
        } ?: return null
        return Converter<Any, String> { value -> requireNotNull(valueGetter.invoke(value)).toString() }
    }
}
