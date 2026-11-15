const { createLogger, transports, format } = require("winston");
const DailyRotateFile = require('winston-daily-rotate-file')
const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new DailyRotateFile({
            filename: "logs/app.log",
            maxSize: "10m",
            maxFiles: "2"
        })
    ]
});

module.exports = logger;