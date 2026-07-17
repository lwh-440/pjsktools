plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
}

subprojects {
    configurations.configureEach {
        resolutionStrategy.eachDependency {
            if (requested.group == "org.jetbrains.kotlin" && requested.name in setOf("kotlin-stdlib-jdk7", "kotlin-stdlib-jdk8")) {
                useTarget("org.jetbrains.kotlin:kotlin-stdlib:${libs.versions.kotlin.get()}")
                because("Kotlin 2.x folds the JDK 7/8 extensions into kotlin-stdlib")
            }
        }
    }
}
