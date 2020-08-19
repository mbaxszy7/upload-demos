/**
 * 服务入口
 */
const http = require("http");
const serve = require("koa-static");
const path = require("path");
const mount = require("koa-mount");
const koaBody = require("koa-body"); //文件保存库
const fs = require("fs");
const Koa = require("koa2");

const app = new Koa();
const port = process.env.PORT || "8100";

const uploadHost = `http://localhost:${port}/uploads/`;

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (e) {
    console.log("internal error:", e);
  }
});

app.use(
  koaBody({
    formidable: {
      //设置文件的默认保存目录，不设置则保存在系统临时目录下  os
      uploadDir: path.resolve(__dirname, "../../static/uploads"),
    },
    multipart: true, // 开启文件上传，默认是关闭
  })
);

//开启静态文件访问
console.log(path.join(__dirname, "..", "..", "static/uploads"));
//)
app.use(mount("/static", serve(path.join(__dirname, "..", "..", "/static"))));
app.use(
  mount("/index.html", serve(path.join(__dirname, "..", "..", "/static")))
);
let result = [];

const stepPipe = (pipeFrom, pipeTo, options) => {
  return new Promise((resolve) => {
    pipeFrom
      .on("end", () => {
        resolve();
      })
      .on("error", () => {
        reject();
      })
      .pipe(pipeTo, options);
  });
};

const mergeChunk = (body) => {
  return new Promise((resolve, reject) => {
    const filename = body.filename,
      folder = path.join(__dirname, "../../static/uploads") + "/";
    const writeStream = fs.createWriteStream(`${folder}${filename}`);

    writeStream
      .on("open", async () => {
        for (let [key, chunk] of Object.entries(result)) {
          await stepPipe(fs.createReadStream(chunk), writeStream, {
            end: false,
          });
          fs.unlink(chunk, (err) => {
            if (err) console.log(err);
          });
        }
        writeStream.emit("end");
      })
      .on("end", () => {
        result = [];
        writeStream.close();
        resolve();
      })
      .on("error", (err) => {
        console.log(err);
        reject(err);
      });
  });
};

app.use(async (ctx, next) => {
  ctx.state.xhr = ctx.request.get("X-Requested-With") === "XMLHttpRequest";
  ctx.set("Access-Control-Allow-Origin", "*");
  await next();
});

//文件二次处理，修改名称
app.use(async (ctx) => {
  console.log(ctx.path);
  if (ctx.path === "/single") {
    for (const [_, file] of Object.entries(ctx.request.files)) {
      const path = file.path;
      const fname = file.name;
      let nextPath = path + fname;

      fs.renameSync(path, nextPath);
      ctx.body = `{
        "fileUrl":"http://localhost:${port}/static/uploads/${nextPath.slice(
        nextPath.lastIndexOf("/") + 1
      )}"
    }`;
    }
  }
  if (ctx.path === "/multiple") {
    const ret = {};
    for (const [_, file] of Object.entries(ctx.request.files)) {
      if (Array.isArray(file)) {
        file.forEach((f) => {
          const path = f.path;
          const fname = f.name;
          let nextPath = path + fname;
          ret[
            fname
          ] = `http://localhost:${port}/static/uploads/${nextPath.slice(
            nextPath.lastIndexOf("/") + 1
          )}`;
          fs.renameSync(path, nextPath);
        });
      } else {
        const path = file.path;
        const fname = file.name;
        let nextPath = path + fname;
        ret[fname] = `http://localhost:${port}/static/uploads/${nextPath.slice(
          nextPath.lastIndexOf("/") + 1
        )}`;
        fs.renameSync(path, nextPath);
      }
      // if(ctx.state.xhr) {
      //   ctx.re
      // }
      ctx.body = ret;
    }
  }
  if (ctx.path === "/chunk") {
    // console.log(ctx.request.files);
    // console.log(ctx.request.body);
    const { token: fileToken, index: fileIndex } = ctx.request.body;
    const body = ctx.request.body;
    let files = ctx.request.files ? ctx.request.files.f1 : []; //得到上传文件的数组

    if (files && !Array.isArray(files)) {
      //单文件上传容错
      files = [files];
    }

    files &&
      files.forEach((item) => {
        const path = item.path;
        const fname = item.name; //原文件名称
        const nextPath = path + fileToken + fname;
        if (item.size > 0 && path) {
          fs.renameSync(path, nextPath);
          result[fileIndex] = nextPath;
        }
      });

    ctx.body = "chunk ok";
    if (body.type === "merge") {
      //合并分片文件
      await mergeChunk(body);
      ctx.body = "merge ok 200";
    }
  }
});

/**
 * http server
 */
const server = http.createServer(app.callback());
server.listen(port);
server.on("connection", (socket) => {
  socket.on("error", (e) => {
    console.log("server socket error", e);
  });
});

server.on("error", (e) => {
  console.log("server  error", e);
});
console.log("demo1 server start ......   ");
