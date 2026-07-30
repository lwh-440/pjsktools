import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

val webRuntimeBaseUrl = providers.gradleProperty("PJSKTOOLS_WEB_RUNTIME_BASE_URL").orElse("")
val configuredApiBaseUrl = providers.gradleProperty("PJSKTOOLS_API_BASE_URL")
    .orElse(providers.environmentVariable("PJSKTOOLS_API_BASE_URL"))
    .orElse("")
    .get()
val debugApiBaseUrl = providers.gradleProperty("pjsk.debugApiBaseUrl")
    .orElse(configuredApiBaseUrl.ifBlank { "http://10.0.2.2:4000/" })
    .get()
val temporaryHttpHost = providers.gradleProperty("PJSKTOOLS_TEMP_HTTP_HOST")
    .orElse(providers.environmentVariable("PJSKTOOLS_TEMP_HTTP_HOST"))
    .orElse("")
    .get()
require(temporaryHttpHost.isBlank() || Regex("^[A-Za-z0-9.-]+$").matches(temporaryHttpHost)) {
    "PJSKTOOLS_TEMP_HTTP_HOST must contain only a hostname or IP address"
}
val signingPropertiesFile = rootProject.file("../.secrets/android-signing.properties")
val signingProperties = Properties().apply {
    if (signingPropertiesFile.isFile) signingPropertiesFile.inputStream().use(::load)
}
fun quotedBuildConfig(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
fun apiBaseUrl(value: String) = value.takeIf(String::isNotBlank)?.let { if (it.endsWith('/')) it else "$it/" }.orEmpty()

android {
    namespace = "com.pjsktools.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pjsktools.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
        buildConfigField("String", "WEB_RUNTIME_BASE_URL", quotedBuildConfig(webRuntimeBaseUrl.get()))
        buildConfigField("String", "TEMPORARY_HTTP_HOST", quotedBuildConfig(temporaryHttpHost))
    }

    signingConfigs {
        if (signingPropertiesFile.isFile) {
            create("release") {
                storeFile = file(signingProperties.getProperty("storeFile"))
                storePassword = signingProperties.getProperty("storePassword")
                keyAlias = signingProperties.getProperty("keyAlias")
                keyPassword = signingProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("String", "API_BASE_URL", quotedBuildConfig(apiBaseUrl(debugApiBaseUrl)))
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        create("staging") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            matchingFallbacks += listOf("debug")
            buildConfigField("String", "API_BASE_URL", quotedBuildConfig(apiBaseUrl(configuredApiBaseUrl.ifBlank { "https://staging.example.invalid/" })))
        }
        release {
            isMinifyEnabled = true
            // AGP 8.5's ShrinkProtoResourcesAction fails consistently on the
            // Windows release builder. Keep R8 enabled and package resources
            // without the unstable post-link shrink step.
            isShrinkResources = false
            buildConfigField("String", "API_BASE_URL", quotedBuildConfig(apiBaseUrl(configuredApiBaseUrl)))
            manifestPlaceholders["usesCleartextTraffic"] = (temporaryHttpHost.isNotBlank()).toString()
            if (signingPropertiesFile.isFile) signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:model"))
    implementation(project(":core:network"))
    implementation(project(":core:api"))
    implementation(project(":core:database"))
    implementation(project(":core:datastore"))
    implementation(project(":core:designsystem"))
    implementation(project(":feature:onboarding"))
    implementation(project(":feature:home"))
    implementation(project(":feature:events"))
    implementation(project(":feature:songs"))
    implementation(project(":feature:cards"))
    implementation(project(":feature:collections"))
    implementation(project(":feature:player"))
    implementation(project(":feature:settings"))
    implementation(project(":feature:account"))
    implementation(project(":feature:favorites"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.work.runtime)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.coil.svg)
    implementation(libs.okhttp.core)
    implementation(libs.retrofit.core)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)
}
