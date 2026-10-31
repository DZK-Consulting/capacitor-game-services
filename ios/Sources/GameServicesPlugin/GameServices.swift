import Foundation
import GameKit

/// Plain helpers with no UI or Capacitor in them, so they can be unit tested.
public enum GameServices {
    /// Why Game Center isn't signed in, in the add-on's words (see `SignInResult.reason` in definitions.ts).
    public static func reason(for error: Error?) -> String {
        guard let error = error as NSError?, error.domain == GKErrorDomain else { return "error" }
        switch GKError.Code(rawValue: error.code) {
        case .cancelled, .userDenied, .notAuthenticated: return "declined"
        case .parentalControlsBlocked, .notSupported, .gameUnrecognized: return "restricted"
        default: return "error"
        }
    }

    /// Clamps an achievement percentage to 0...100 and never lets it go below what's already reported.
    public static func progress(requested: Double, current: Double) -> Double {
        return max(min(max(requested, 0), 100), current)
    }
}
