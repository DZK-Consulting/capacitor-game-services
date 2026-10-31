package au.com.dzk.gameservices;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class GameServicesTest {

    @Test
    public void percentBecomesStepsClampedAndRoundedDown() {
        assertEquals(0, GameServices.stepsFor(-5));
        assertEquals(0, GameServices.stepsFor(Double.NaN));
        assertEquals(42, GameServices.stepsFor(42.9));
        assertEquals(100, GameServices.stepsFor(100));
        assertEquals(100, GameServices.stepsFor(250));
    }

    @Test
    public void scoresAreWholeAndNeverNegative() {
        assertEquals(0L, GameServices.scoreFor(-1));
        assertEquals(1234L, GameServices.scoreFor(1234.9));
    }
}
