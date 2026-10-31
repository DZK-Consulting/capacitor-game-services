package au.com.dzk.gameservices;

/** Plain helpers with no Android or Capacitor in them, so they can be unit tested. */
public final class GameServices {

    /** Steps used for "percent" achievements: make them incremental in Play Console with this many steps. */
    public static final int PROGRESS_STEPS = 100;

    private GameServices() {}

    /** An achievement percentage (0 to 100) as Play Games steps, rounded down and clamped. */
    public static int stepsFor(double percent) {
        if (Double.isNaN(percent) || percent <= 0) return 0;
        if (percent >= 100) return PROGRESS_STEPS;
        return (int) Math.floor((percent * PROGRESS_STEPS) / 100.0);
    }

    /** A score as Play Games takes it: a whole number, never negative. */
    public static long scoreFor(double score) {
        if (Double.isNaN(score) || score <= 0) return 0;
        return (long) Math.floor(score);
    }
}
