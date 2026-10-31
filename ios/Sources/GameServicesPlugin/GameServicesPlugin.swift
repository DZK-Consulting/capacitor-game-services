import Foundation
import Capacitor
import GameKit
import UIKit

/// Apple Game Center for Capacitor (see definitions.ts for what each call does).
@objc(GameServicesPlugin)
public class GameServicesPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameServicesPlugin"
    public let jsName = "GameServices"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSignedIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getServerProof", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlockAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAchievementProgress", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAchievements", returnType: CAPPluginReturnPromise)
    ]

    /// Sign-in calls waiting for Game Center's answer. Game Center calls its handler again whenever the player signs
    /// in or out, so the handler is set once and every waiting call is answered from it.
    private var waiting: [CAPPluginCall] = []
    private var handlerSet = false
    private var lastError: Error?

    private var player: GKLocalPlayer { GKLocalPlayer.local }

    private func status(_ error: Error? = nil) -> [String: Any] {
        if player.isAuthenticated { return ["signedIn": true, "platform": "game-center"] }
        var r: [String: Any] = ["signedIn": false, "platform": "game-center", "reason": GameServices.reason(for: error)]
        if let error = error { r["message"] = error.localizedDescription }
        return r
    }

    // MARK: - Signing in

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.player.isAuthenticated { call.resolve(self.status()); return }
            self.waiting.append(call)
            if self.handlerSet {
                // Game Center has already answered once and won't again until something changes.
                if self.lastError != nil || !self.player.isAuthenticated { self.answerWaiting() }
                return
            }
            self.handlerSet = true
            self.player.authenticateHandler = { [weak self] viewController, error in
                guard let self = self else { return }
                if let viewController = viewController {
                    // Apple's own sign-in sheet, the first time: answered when it closes.
                    self.bridge?.viewController?.present(viewController, animated: true)
                    return
                }
                self.lastError = error
                self.answerWaiting()
            }
        }
    }

    private func answerWaiting() {
        let result = status(lastError)
        let calls = waiting
        waiting.removeAll()
        calls.forEach { $0.resolve(result) }
    }

    @objc func isSignedIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.status()) }
    }

    // MARK: - Proof for the game's server

    @objc func getServerProof(_ call: CAPPluginCall) {
        guard player.isAuthenticated else { call.reject("Not signed in to Game Center", "NOT_SIGNED_IN"); return }
        guard let bundleId = Bundle.main.bundleIdentifier else { call.reject("No bundle ID", "ERROR"); return }
        let playerId = player.teamPlayerID
        player.fetchItems { url, signature, salt, timestamp, error in
            if let error = error { call.reject(error.localizedDescription, "ERROR", error); return }
            guard let url = url, let signature = signature, let salt = salt else {
                call.reject("Game Center returned no signature", "ERROR")
                return
            }
            call.resolve([
                "platform": "game-center",
                "playerId": playerId,
                "bundleId": bundleId,
                "publicKeyUrl": url.absoluteString,
                "signature": signature.base64EncodedString(),
                "salt": salt.base64EncodedString(),
                "timestamp": String(timestamp)
            ])
        }
    }

    // MARK: - Scores and achievements

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId"), let score = call.getDouble("score") else {
            call.reject("leaderboardId and score are required", "BAD_INPUT")
            return
        }
        guard player.isAuthenticated else { call.resolve(); return }
        GKLeaderboard.submitScore(Int(score.rounded(.down)), context: 0, player: player, leaderboardIDs: [id]) { error in
            if let error = error { call.reject(error.localizedDescription, "ERROR", error) } else { call.resolve() }
        }
    }

    @objc func unlockAchievement(_ call: CAPPluginCall) {
        guard let id = call.getString("achievementId") else { call.reject("achievementId is required", "BAD_INPUT"); return }
        report(call, id: id, percent: 100)
    }

    @objc func setAchievementProgress(_ call: CAPPluginCall) {
        guard let id = call.getString("achievementId"), let percent = call.getDouble("percent") else {
            call.reject("achievementId and percent are required", "BAD_INPUT")
            return
        }
        report(call, id: id, percent: percent)
    }

    private func report(_ call: CAPPluginCall, id: String, percent: Double) {
        guard player.isAuthenticated else { call.resolve(); return }
        GKAchievement.loadAchievements { achievements, _ in
            let current = achievements?.first(where: { $0.identifier == id })?.percentComplete ?? 0
            let next = GameServices.progress(requested: percent, current: current)
            if next <= current && current > 0 { call.resolve(); return } // already there
            let achievement = GKAchievement(identifier: id)
            achievement.percentComplete = next
            achievement.showsCompletionBanner = true
            GKAchievement.report([achievement]) { error in
                if let error = error { call.reject(error.localizedDescription, "ERROR", error) } else { call.resolve() }
            }
        }
    }

    // MARK: - Apple's own screens

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        let id = call.getString("leaderboardId")
        DispatchQueue.main.async {
            let vc = id.map { GKGameCenterViewController(leaderboardID: $0, playerScope: .global, timeScope: .allTime) }
                ?? GKGameCenterViewController(state: .leaderboards)
            self.present(vc, call)
        }
    }

    @objc func showAchievements(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.present(GKGameCenterViewController(state: .achievements), call) }
    }

    private func present(_ vc: GKGameCenterViewController, _ call: CAPPluginCall) {
        guard player.isAuthenticated else { call.reject("Not signed in to Game Center", "NOT_SIGNED_IN"); return }
        vc.gameCenterDelegate = self
        bridge?.viewController?.present(vc, animated: true)
        call.resolve()
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
