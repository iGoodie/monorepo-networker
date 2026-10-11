import { CLIENT, NUI } from "@common/networkSides";
import { Networker } from "../../../../src";
import { NUI_CHANNEL } from "@nui/ui.network";

Networker.initialize(NUI);

NUI_CHANNEL.subscribeListener("displayGpsWaypoint", (x, y, color) => {
	console.log("GPS waypoint", x, y, color);
});

NUI_CHANNEL.request(CLIENT, "updatePlayerLocation", 100, 200);

