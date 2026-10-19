function attachLogPipeErrorGuards(streams) {
    for (const stream of streams) {
        if (!stream || typeof stream.on !== "function") continue;
        stream.on("error", error => {
            if (error?.code === "EPIPE") return;
            throw error;
        });
    }
}

module.exports = {attachLogPipeErrorGuards};
