package au.com.dzk.gameservices;

import android.app.Activity;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.tasks.Task;

/**
 * Google Play Games Services v2 for Capacitor (see definitions.ts for what each call does).
 *
 * The game's own AndroidManifest.xml must name its Play Games project (see the README):
 * {@code <meta-data android:name="com.google.android.gms.games.APP_ID" android:value="@string/game_services_project_id" />}
 */
@CapacitorPlugin(name = "GameServices")
public class GameServicesPlugin extends Plugin {

    private static final String TAG = "GameServices";
    private static final int RC_SHOW = 9101;
    private boolean ready = false;

    @Override
    public void load() {
        try {
            PlayGamesSdk.initialize(getContext());
            ready = true;
        } catch (Exception e) {
            // Usually a missing APP_ID in the game's manifest: the game still runs, as a guest.
            Logger.error(TAG, "Play Games could not start", e);
        }
    }

    private GamesSignInClient signInClient() {
        return PlayGames.getGamesSignInClient(getActivity());
    }

    private static JSObject status(boolean signedIn, String reason, String message) {
        JSObject r = new JSObject();
        r.put("signedIn", signedIn);
        r.put("platform", "play-games");
        if (!signedIn) r.put("reason", reason);
        if (message != null) r.put("message", message);
        return r;
    }

    private static JSObject statusFrom(Task<AuthenticationResult> task, String notSignedInReason) {
        if (!task.isSuccessful()) {
            Exception e = task.getException();
            return status(false, "error", e != null ? e.getMessage() : null);
        }
        boolean signedIn = task.getResult() != null && task.getResult().isAuthenticated();
        return status(signedIn, notSignedInReason, null);
    }

    // ---------- signing in ----------

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!ready) {
            call.resolve(status(false, "unavailable", "Play Games is not set up in this app"));
            return;
        }
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        GamesSignInClient client = signInClient();
        client.isAuthenticated().addOnCompleteListener((task) -> {
            boolean signedIn = task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated();
            if (signedIn || !interactive) {
                // Play Games signs in on its own at launch when it can; anything else is the player's choice.
                call.resolve(statusFrom(task, "declined"));
                return;
            }
            client.signIn().addOnCompleteListener((t) -> call.resolve(statusFrom(t, "declined")));
        });
    }

    @PluginMethod
    public void isSignedIn(PluginCall call) {
        if (!ready) {
            call.resolve(status(false, "unavailable", null));
            return;
        }
        signInClient()
            .isAuthenticated()
            .addOnCompleteListener((task) -> call.resolve(statusFrom(task, "declined")));
    }

    // ---------- proof for the game's server ----------

    @PluginMethod
    public void getServerProof(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        if (serverClientId == null || serverClientId.isEmpty()) {
            call.reject("serverClientId is required on Android", "BAD_INPUT");
            return;
        }
        if (!ready) {
            call.reject("Play Games is not set up in this app", "NOT_SIGNED_IN");
            return;
        }
        signInClient()
            .requestServerSideAccess(serverClientId, false)
            .addOnCompleteListener((task) -> {
                if (!task.isSuccessful() || task.getResult() == null) {
                    Exception e = task.getException();
                    call.reject(e != null ? e.getMessage() : "Not signed in to Play Games", "NOT_SIGNED_IN", e);
                    return;
                }
                JSObject r = new JSObject();
                r.put("platform", "play-games");
                r.put("authCode", task.getResult());
                call.resolve(r);
            });
    }

    // ---------- scores and achievements ----------

    @PluginMethod
    public void submitScore(PluginCall call) {
        String id = call.getString("leaderboardId");
        Double score = call.getDouble("score");
        if (id == null || score == null) {
            call.reject("leaderboardId and score are required", "BAD_INPUT");
            return;
        }
        whenSignedIn(call, () -> {
            PlayGames.getLeaderboardsClient(getActivity()).submitScore(id, GameServices.scoreFor(score));
            call.resolve();
        });
    }

    @PluginMethod
    public void unlockAchievement(PluginCall call) {
        String id = call.getString("achievementId");
        if (id == null) {
            call.reject("achievementId is required", "BAD_INPUT");
            return;
        }
        whenSignedIn(call, () -> {
            PlayGames.getAchievementsClient(getActivity()).unlock(id);
            call.resolve();
        });
    }

    @PluginMethod
    public void setAchievementProgress(PluginCall call) {
        String id = call.getString("achievementId");
        Double percent = call.getDouble("percent");
        if (id == null || percent == null) {
            call.reject("achievementId and percent are required", "BAD_INPUT");
            return;
        }
        int steps = GameServices.stepsFor(percent);
        whenSignedIn(call, () -> {
            // setSteps never lowers progress: it sets "at least this many".
            if (steps > 0) PlayGames.getAchievementsClient(getActivity()).setSteps(id, steps);
            call.resolve();
        });
    }

    /** Runs `then` if a player is signed in; otherwise resolves quietly, so games can call without checking. */
    private void whenSignedIn(PluginCall call, Runnable then) {
        if (!ready) {
            call.resolve();
            return;
        }
        signInClient()
            .isAuthenticated()
            .addOnCompleteListener((task) -> {
                if (task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated()) {
                    try {
                        then.run();
                    } catch (Exception e) {
                        call.reject(e.getMessage(), "ERROR", e);
                    }
                } else {
                    call.resolve();
                }
            });
    }

    // ---------- Google's own screens ----------

    @PluginMethod
    public void showLeaderboard(PluginCall call) {
        String id = call.getString("leaderboardId");
        whenSignedInOrReject(call, () -> {
            Task<Intent> intent =
                id != null
                    ? PlayGames.getLeaderboardsClient(getActivity()).getLeaderboardIntent(id)
                    : PlayGames.getLeaderboardsClient(getActivity()).getAllLeaderboardsIntent();
            show(call, intent);
        });
    }

    @PluginMethod
    public void showAchievements(PluginCall call) {
        whenSignedInOrReject(call, () -> show(call, PlayGames.getAchievementsClient(getActivity()).getAchievementsIntent()));
    }

    private void whenSignedInOrReject(PluginCall call, Runnable then) {
        if (!ready) {
            call.reject("Play Games is not set up in this app", "NOT_SIGNED_IN");
            return;
        }
        signInClient()
            .isAuthenticated()
            .addOnCompleteListener((task) -> {
                if (task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated()) then.run();
                else call.reject("Not signed in to Play Games", "NOT_SIGNED_IN");
            });
    }

    private void show(PluginCall call, Task<Intent> intent) {
        intent.addOnCompleteListener((task) -> {
            Activity activity = getActivity();
            if (!task.isSuccessful() || task.getResult() == null || activity == null) {
                Exception e = task.getException();
                call.reject(e != null ? e.getMessage() : "Could not open Play Games", "ERROR", e);
                return;
            }
            activity.startActivityForResult(task.getResult(), RC_SHOW);
            call.resolve();
        });
    }
}
