# upload-demos [文件上传 Demo]

## 单文件表单上传

### 前端：

1. 可以不用 js 处理
2. form 表单加 `enctype="multipart/form-data"`

### 后端 Koa：

1. 从 ctx.request.files 中获取上传的文件

## 多文件表单上传

### 前端：

input 标签上 `multiple` 即可支持多文件上传

## fetch 上传

### 前端：

用`FormData` 构造表单对象，fetch 会自动加上 `Content-Type': 'multipart/form-data`

## 多文件多进度可取消可预览图片上传

### 前端：

1. 使用给 img 标签`window.URL.createObjectURL` 构造 input file 的 src，在 img onload 上处理清理内存：

```js
img.onload = function () {
  //处理清理内存
  window.URL.revokeObjectURL(this.src);
};
```

2. xhr 上传，调用 abort 取消上传后，state 立即变成了 4,并不会变成 0。处理上传：

```js
xhr.onprogress = updateProgress;
xhr.upload.onprogress = updateProgress;
function updateProgress(event) {
  // 标志位， ProgressEvent的长度可以被计算
  if (event.lengthComputable) {
    const completedPercent = ((event.loaded / event.total) * 100).toFixed(2);
    progressSpan.innerHTML = completedPercent + "%";
    if (completedPercent >= 100) {
      //增加自定义属性,上传完成
      xhr.uploaded = true;
    }
  }
}
//注意 send 一定要写在最下面，否则 onprogress 只会执行最后一次 也就是100%的时候
xhr.send(fd);
```

3. 控制并发数量的并发上传，返回结果不乱序

```js
// 限制并发数量的并发请求（返回的顺序对应）
const fetchQueue = async (urlsArr, fetcher) => {
  // Promise.allSettled 取代Promise.map
  const res = await Promise.allSettled(urlsArr.map((url) => fetcher(url)));
  return res.map((r) => {
    return r.status === "fulfilled"
      ? r.value
      : r.status === "rejected"
      ? r.reason
      : "";
  });
};

// 控制并发url的数量数量
const getLimitUrls = (urlsArr, limit) => {
  const storage = [];
  do {
    storage.push(urlsArr.splice(0, limit));
  } while (urlsArr.length > limit);

  if (urlsArr.length > 0) {
    storage.push(urlsArr);
  }
  return storage;
};

const fetcher = (url) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (url.makeError) {
        reject(url.ctx + ",error");
      }
      resolve(url.ctx);
    }, url.timeout * 1000);
  });
};

const mapLimit = async (urlsArr, limit, fetcher) => {
  const results = [];
  const urlGroup = getLimitUrls(urlsArr, limit);
  for (const [key, urlsArr] of Object.entries(urlGroup)) {
    // console.time(key);
    results.push(await fetchQueue(urlsArr, fetcher));
    // console.timeLog(key);
  }
  return results;
};
```

## 分片断点续传上传

### 前端：

1. 设置分片的大小
2. 用 FileReader 分片获取文件的 array buffer，使用 SparkMD5 计算分片的 buffer 的 MD5 值
3. 上传分片的文件，注意需要上传各个分片的 index 顺序，上传成功后，在前端（localStorage）记录
4. 浏览器端所有分片上传完成，发送给服务端一个合并文件的请求，这样后端可以合并分片保存的文件

### 后端 Koa：

1. 保存前端上传的分片文件
2. 后端根据各分片顺序进行文件合并
3. 使用 stream pipe 处理：

```js
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
        // result保存了分片文件的路径
        for (let [key, chunk] of Object.entries(result)) {
          // pipe 同步化，上一个分片chunk处理完后，才可以处理下一个chunk
          await stepPipe(fs.createReadStream(chunk), writeStream, {
            end: false,
          });
          // 删除chunk
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
```

参考资料：https://juejin.im/post/6844903968338870285
