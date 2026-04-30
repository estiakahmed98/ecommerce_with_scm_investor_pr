// import { google } from "googleapis";
// import { OAuth2Client } from "google-auth-library";

// const SCOPES = ["https://www.googleapis.com/auth/calendar"];

// // Load credentials from the JSON file
// const credentials = require("path/to/credentials.json");

// // Create an OAuth2 client
// const oAuth2Client = new OAuth2Client(
//   credentials.web.client_id,
//   credentials.web.client_secret,
//   credentials.web.redirect_uris[0]
// );

// // Function to get an authorized client
// const getAuthorizedClient = async (): Promise<OAuth2Client> => {
//   const token = await fs.promises.readFile("path/to/token.json");
//   oAuth2Client.setCredentials(JSON.parse(token.toString()));
//   return oAuth2Client;
// };

// // Function to fetch calendar metadata
// const getCalendarMetadata = async (calendarId: string) => {
//   const auth = await getAuthorizedClient();
//   const calendar = google.calendar({ version: "v3", auth });

//   const response = await calendar.calendars.get({
//     calendarId,
//   });

//   return response.data;
// };

// // Function to create a calendar event
// const createCalendarEvent = async (calendarId: string, task: Task) => {
//   const auth = await getAuthorizedClient();
//   const calendar = google.calendar({ version: "v3", auth });

//   const event = {
//     summary: task.title,
//     description: task.description,
//     start: {
//       date: task.date,
//       timeZone: "UTC",
//     },
//     end: {
//       date: task.date,
//       timeZone: "UTC",
//     },
//   };

//   const response = await calendar.events.insert({
//     calendarId,
//     requestBody: event,
//   });

//   return response.data;
// };
