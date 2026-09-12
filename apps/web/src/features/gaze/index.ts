// Eye tracking. Reads the webcam, estimates where on the viewport the user is
// looking, and turns that into GazeSample values and attention metrics.
// Everything exported from here must work without the 3D scene.
export type { GazeSample } from "@grugchug/shared";

import webgazer from '@webgazer-ts/core';

webgazer.setGazeListener(function(data, elapsedTime) {
    if (data == null) {
        return;
    }
    var xprediction = data.x; //these x coordinates are relative to the viewport
    var yprediction = data.y; //these y coordinates are relative to the viewport
    console.log("X: " + xprediction + ", Y: " + yprediction, elapsedTime);
}).begin();