const {Telegraf} = require('telegraf');
const {MenuTemplate, MenuMiddleware} = require('telegraf-inline-menu');
const os = require("os");
const {activeState, restart, start, stop} = require("linux-systemd");
const ip = require("ip");

const getState = async (svc) => await activeState(svc);

const chatId = process.env.CHAT_ID;
const allowedServices = process.env.ALLOWED_SERVICES.split(" ").map(s => {
    return {name: s, state: "unknown"}
}).reduce((map, obj) => {
    map[obj.name] = obj;
    return map;
}, {});

const emoji = require('node-emoji')
const bot = new Telegraf(process.env.TOKEN);

const unicodeStates = {
    "refreshing": emoji.get("mag_right"),
    "unknown": emoji.get("question"),
    "inactive": emoji.get("arrow_down"),
    "activating": emoji.get("arrow_heading_up"),
    "deactivating": emoji.get("arrow_heading_down"),
    "active": emoji.get("arrow_up"),
};


const checkId = (id) => chatId === id.toString();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

const rootMenu = new MenuTemplate(ctx => `${os.hostname()} ${ip.address()}`);

Object.keys(allowedServices).forEach(svc => {
    const serviceMenu = new MenuTemplate(ctx => `${unicodeStates[ctx.allowedServices[svc].state]} ${svc}`);

    serviceMenu.interact(`${emoji.get("fire")} start`, "start", {
        joinLastRow: true,
        do: async ctx => {
            await start(svc)
            ctx.allowedServices[svc].state = await getState(svc);
            return true
        }
    })

    serviceMenu.interact(`${emoji.get("ocean")}${emoji.get("fire")}  restart`, "restart", {
        joinLastRow: true,
        do: async ctx => {
            await restart(svc)
            ctx.allowedServices[svc].state = await getState(svc);
            return true
        }
    })

    serviceMenu.interact(`${emoji.get("ocean")} stop`, "stop", {
        joinLastRow: true,
        do: async ctx => {
            await stop(svc)
            ctx.allowedServices[svc].state = await getState(svc);
            return true
        }
    })

    serviceMenu.interact(`${emoji.get("mag_right")} refresh`, "refresh", {
        do: async ctx => {
            ctx.allowedServices[svc].state = await getState(svc);
            return true
        }
    })

    serviceMenu.interact(`${emoji.get("arrow_backward")} back`, "back", {
        do: async ctx => {
            return ".."
        }
    })

    rootMenu.submenu(ctx => `${unicodeStates[ctx.allowedServices[svc].state]} ${ctx.allowedServices[svc].name}`, svc, serviceMenu)
});


rootMenu.interact(`${emoji.get("mag_right")} refresh`, "refresh", {
    do: async ctx => {
        for (let svc of Object.keys(ctx.allowedServices)) {
            ctx.allowedServices[svc].state = await getState(svc);
        }

        return true
    }
});

const menuMiddleware = new MenuMiddleware('/', rootMenu);

bot.use((ctx, next) => {
    ctx.allowedServices = allowedServices;

    return next();
})

bot.start((ctx) => {
    if (!checkId(ctx.update.message.from.id)) {
        return
    }

    return menuMiddleware.replyToContext(ctx);
});

bot.use(menuMiddleware);
bot.launch();
