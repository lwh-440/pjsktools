pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven { url = uri(rootDir.resolve(".local-maven")) }
        google()
        mavenCentral()
    }
}

rootProject.name = "PjskToolsAndroid"
include(
    ":app",
    ":core:common",
    ":core:model",
    ":core:api",
    ":core:network",
    ":core:database",
    ":core:datastore",
    ":core:designsystem",
    ":core:testing",
    ":feature:onboarding",
    ":feature:home",
    ":feature:events",
    ":feature:songs",
    ":feature:cards",
    ":feature:collections",
    ":feature:player",
    ":feature:settings",
    ":feature:account",
    ":feature:favorites"
)
