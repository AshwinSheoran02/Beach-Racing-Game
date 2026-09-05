# Verification record

Verified in the desktop browser, September 5, 2026. TypeScript check and Vite production build pass.

## Browser race runs

1. Complete three-lap race with the player driven by the test-only controller, using the same physics as normal keyboard play. All six racers finished. This exposed cooldown laps entering the lap history; fixed by freezing checkpoint/lap recording after finish.
2. Mixed control and recovery run: accelerated from rest to approximately 113 km/h in two seconds; braked to a stop and reversed to the 29 km/h reverse limit; exercised handbrake/left steering, right steering and boundary impact. Moved outside the boundary and recovered to within 0.2 m of the centerline. Deliberately skipped ahead to 80% of the circuit: no lap was awarded; subsequent ordered checkpoints restored valid progress. Completed the race after recovery.
3. Restarted from the pause screen and completed another full race after fixes. Final times: KAI 1:43.02, FINN 1:43.57, NOVA 1:45.08, MAYA 1:46.65, RIO 1:49.23, player test controller 1:49.43. Every racer had exactly three recorded laps. The standings followed those finish times.

## Visual checks

Inspected title, chase camera, shoreline, start arch, lap HUD, minimap and final standings. Fixed reversed banner text and starting-grid model placement. Adjusted exposure and brought the shoreline closer to the track. The final title shows the ocean, boats, lifeguard towers, umbrellas and beach circuit.

## Test method and limits

Browser buttons drove timed throttle, brake, steering and drift inputs through the actual simulation. Full race completion used an AI driver for the player, with accelerated fixed-step simulation. This verifies complete race behavior but is not equivalent to a human usability study. Audio nodes and event triggers are implemented; subjective listening quality and performance on other laptops have not been benchmarked.

Development only: open `/?test=1` to expose AUTO, time-advance, timed driving and recovery buttons plus a status record. These controls and the test API are gated by `import.meta.env.DEV` and are absent from production builds. Normal play never enables the player AI driver before the finish.
