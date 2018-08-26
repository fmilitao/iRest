import { exec } from "child_process";
import { app, Menu, nativeImage, Tray } from "electron";
import * as moment from "moment";
import { notify } from "node-notifier";
import * as util from "util";

// Image from: https://www.iconfinder.com/icons/226587/clock_icon
const base64Icon = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAA
AQCAYAAAAf8/9hAAABLElEQVQ4T5XTOyvHURzH8dc/k4E8BEW5PQFGLMpiwGRCGKV4EAxG5T
bZGGwYXDZm5VaUhyBmpW+dX/3+x+/ncpZT38v7ezmf01B/etGZ3K94rAptZMYWzGMVXZnvBR
vYxWfhKwM6cISRFLSPuxQ4gNkEP8cU3sJXAKLyGfowg8uUOJHu43QP4wD3GItOCsAitlL1q1
Lr0VGcyZItINHFErYLwDMusJDNXQWIkO1UrDsAse0HDOHmj4BBXEduAGKWE7TjowLQivHM3o
b3yP0NEE+6gxVsliBNgJ9GiJzllDyNwwRpGiFsdUssisa7P+E2GZqWGLbiGUdLGqgTeeUzhp
BO0Z8JKYfUCikCQ8oxY3QRev+XlItK0ckc1mo+0zr26j5T3m5P9p1jid/OF8vJR+0JUhE+AA
AAAElFTkSuQmCC`;

// TODO: refactor configs
const CONFIG = {
  REST_REPEAT_INTERVAL: moment.duration(10, "seconds"),
  REST_DURATION: moment.duration(20, "seconds"),
  REST_MESSAGE: "Eye rest period! Click to skip.",
  QUIT_MESSAGE: "Quit",
  TOOL_TIP: "Placeholder tool tip (does this work?)",
};

namespace Utils {
  const execPromise = util.promisify(exec);

  export function say(message: string) {
    // 'say' only works in macOS
    return execPromise(`say "${message}"`);
  }

  export function buildTrayMenu(restMessage: string, intervalMessage: string) {
    return Menu.buildFromTemplate([
      { label: restMessage, enabled: false },
      { type: "separator" },
      { label: intervalMessage, type: "radio", enabled: false },
      { type: "separator" },
      { label: CONFIG.QUIT_MESSAGE, role: "quit" },
    ]);
  }

  export function buildTray() {
    const icon = nativeImage.createFromDataURL(base64Icon);
    const tray = new Tray(icon);
    // TODO: not sure this is working in macOS
    tray.setToolTip(CONFIG.TOOL_TIP);
    return tray;
  }

  export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // returns true if notification was clicked, false otherwise
  export async function showNotification(message: string) {
    return new Promise((resolve, reject) => {
      notify(
        { message, wait: true },
        async (error, response) => {
          if (error) {
            return reject(error);
          }
          console.log(response);
          // response === "timeout" when no action was taken
          // response === "activate" when notification clicked
          return resolve(response === "activate");
        });
    });
  }
}

async function reminderStep(tray: Tray) {
  // timeout
  const nextRest = moment().add(CONFIG.REST_REPEAT_INTERVAL);
  const restMessage = `Next eye rest: ${nextRest.format("HH:mm:ss")}`;
  const intervalMessage = `Every ${CONFIG.REST_REPEAT_INTERVAL}`;

  tray.setContextMenu(Utils.buildTrayMenu(restMessage, intervalMessage));
  await Utils.showNotification(restMessage);
  await Utils.sleep(CONFIG.REST_REPEAT_INTERVAL.asMilliseconds());

  // notification
  const clicked = await Utils.showNotification(CONFIG.REST_MESSAGE);
  if (!clicked) {
    await Utils.say(`Look away for ${CONFIG.REST_DURATION.asSeconds()} seconds`);
    await Utils.sleep(CONFIG.REST_DURATION.asMilliseconds());
    await Utils.say("Exercise done!");
  } else {
    await Utils.say("Skipping exercise.");
  }
}

// start up the app
app.on("ready", async () => {
  const tray = Utils.buildTray();

  while (true) {
    await reminderStep(tray);
  }
});

// don't show icon in dock
app.dock.hide();
