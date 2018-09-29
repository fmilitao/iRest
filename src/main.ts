import { exec } from "child_process";
import { app, Menu, nativeImage, Tray } from "electron";
import * as moment from "moment";
import * as NotificationCenter from "node-notifier/notifiers/notificationcenter";
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

const CONFIG = {
  PARAMS: {
    REPEAT_INTERVAL: moment.duration(20, "minutes"),
    EXERCISE_DURATION: moment.duration(20, "seconds"),
  },
  MESSAGES: {
    NOTIFICATION_TITLE: "iRest Notification",
    NEXT_REST: (date: moment.Moment) => `Next eye rest: ${date.format("HH:mm:ss")}`,
    REST_INTERVAL: (date: moment.Duration) => `Every ${date}`,
    SKIPPED: "Skipping exercise.",
    EXERCISE_START: (seconds: number) => `Look at something 20 feet away for ${seconds} seconds.`,
    EXERCISE_DONE: "Exercise done!",
    REST_MESSAGE: "Eye rest period approaching!\n(click notification to skip)",
    QUIT_MESSAGE: "Quit",
    RESET_MESSAGE: "Reset timer",
    TOOL_TIP: "Placeholder tool tip (does this work?)",
  },
};

namespace Utils {
  const execPromise = util.promisify(exec);

    // 'say' only works in macOS
  export async function say(message: string) {
    try {
      return await execPromise(`say "${message}"`);
    } catch (error) {
      console.log(`Failed to say: ${message}`, error);
  }
  }

  export function buildTrayMenu(
    restMessage: string,
    intervalMessage: string,
    resetFunction: () => void,
  ) {
    return Menu.buildFromTemplate([
      { label: restMessage, enabled: false },
      { label: CONFIG.MESSAGES.RESET_MESSAGE, click: resetFunction },
      { type: "separator" },
      { label: intervalMessage, type: "radio", enabled: false },
      { type: "separator" },
      { label: CONFIG.MESSAGES.QUIT_MESSAGE, role: "quit" },
    ]);
  }

  export function buildTray() {
    const icon = nativeImage.createFromDataURL(base64Icon);
    const tray = new Tray(icon);
    // TODO: not sure this is working in macOS
    tray.setToolTip(CONFIG.MESSAGES.TOOL_TIP);
    return tray;
  }

  export function sleep(ms: number) {
    let cancelFunction: () => void;
    const sleepPromise = new Promise((resolve) => {
      const timeoutHandler = setTimeout(() => resolve(true), ms);
      cancelFunction = () => {
        clearTimeout(timeoutHandler);
        resolve(false);
      };
    });
    return { sleepPromise, cancelFunction };
  }

  const notificationCenter = new NotificationCenter();

  // returns true if notification was clicked, false otherwise
  export async function showNotification(message: string, subtitle?: string) {
    return new Promise((resolve, reject) => {
      notificationCenter.notify(
        {
          title: CONFIG.MESSAGES.NOTIFICATION_TITLE,
          subtitle,
          message,
          wait: true,
        },
        async (error, response) => {
          if (error) {
            return reject(error);
          }
          // response === "timeout" when no action was taken
          // response === "activate" when notification was clicked
          return resolve(response === "activate");
        });
    });
  }
}

async function reminderStep(tray: Tray) {
  // timeout
  const nextRest = moment().add(CONFIG.PARAMS.REPEAT_INTERVAL);
  const restMessage = CONFIG.MESSAGES.NEXT_REST(nextRest);
  const intervalMessage = CONFIG.MESSAGES.REST_INTERVAL(CONFIG.PARAMS.REPEAT_INTERVAL);

  // don't wait for notification since otherwise we will be off by 5 seconds (which is the
  // time the notification will take to disappear)
  Utils.showNotification(restMessage);

  // update menu
  const { sleepPromise, cancelFunction } = Utils.sleep(CONFIG.PARAMS.REPEAT_INTERVAL.asMilliseconds());
  tray.setContextMenu(Utils.buildTrayMenu(restMessage, intervalMessage, cancelFunction));
  const timeoutTriggered = await sleepPromise;
  // if sleep period was reset then the timeout was not triggered
  if (!timeoutTriggered) {
    return;
  }

  // notification
  const clicked = await Utils.showNotification(CONFIG.MESSAGES.REST_MESSAGE);
  if (!clicked) {
    await Utils.say(CONFIG.MESSAGES.EXERCISE_START(CONFIG.PARAMS.EXERCISE_DURATION.asSeconds()));
    await Utils.sleep(CONFIG.PARAMS.EXERCISE_DURATION.asMilliseconds()).sleepPromise;
    await Utils.say(CONFIG.MESSAGES.EXERCISE_DONE);
  } else {
    await Utils.say(CONFIG.MESSAGES.SKIPPED);
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
