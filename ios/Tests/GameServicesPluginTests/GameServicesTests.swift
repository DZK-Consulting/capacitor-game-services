import XCTest
import GameKit
@testable import GameServicesPlugin

class GameServicesTests: XCTestCase {
    func testReasonForGameCenterErrors() {
        let err = { (code: GKError.Code) in NSError(domain: GKErrorDomain, code: code.rawValue) }
        XCTAssertEqual(GameServices.reason(for: err(.cancelled)), "declined")
        XCTAssertEqual(GameServices.reason(for: err(.parentalControlsBlocked)), "restricted")
        XCTAssertEqual(GameServices.reason(for: err(.communicationsFailure)), "error")
        XCTAssertEqual(GameServices.reason(for: NSError(domain: "other", code: 1)), "error")
        XCTAssertEqual(GameServices.reason(for: nil), "error")
    }

    func testProgressIsClampedAndNeverGoesBackwards() {
        XCTAssertEqual(GameServices.progress(requested: 150, current: 0), 100)
        XCTAssertEqual(GameServices.progress(requested: -5, current: 0), 0)
        XCTAssertEqual(GameServices.progress(requested: 30, current: 60), 60)
        XCTAssertEqual(GameServices.progress(requested: 70, current: 60), 70)
    }
}
