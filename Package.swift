// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorGameServices",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapacitorGameServices",
            targets: ["GameServicesPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "GameServicesPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/GameServicesPlugin",
            linkerSettings: [.linkedFramework("GameKit")]),
        .testTarget(
            name: "GameServicesPluginTests",
            dependencies: ["GameServicesPlugin"],
            path: "ios/Tests/GameServicesPluginTests")
    ]
)