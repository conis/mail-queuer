# mail-queuer

mail-queuer是提供一个邮件队列服务，它可以部署到一台专门的服务器上。经过验证的服务器可以向它发送邮件任务，它会将发送任务排队，然后依次执行任务。一个很典型的应用类似于这样，我们把mail-queuer部署到appFog(例如：smtp.af.cm)上，而将你的网站部署在自己的服务器上，当你需要向用户发送一个欢迎邮件时，您只需要向smtp.af.cm这个服务器发送一个邮件任务即可。
mail-queuer还有一个特点就是可以根据模板(jade)渲染邮件，并且可以支持国际化邮件，你可以设置各种语言的模板。请求服务器只需要提供JSON数据即可，并且邮件的标题也是可以格式化的。

## 应用场景
  mail-queuer适合批量发送邮件，例如会员的欢迎邮件、激活邮件、订单邮件等等。与SES这类服务不同的是，mail-queuer可以渲染邮件。所以，你可以将mail-queuer部署到一个若干个免费云上，让它们免费为你工作，减少对生产服务器的压力。

## Install

    $ npm install mail-queuer

## 如何使用

### 邮件队列服务器

1. 引入定义及配置mongoose

    var nodemailer = require("nodemailer");
    var mongoose = require("mongoose");
    var mailQueuer = require('mail-queuer');
    mongoose.connect('mongodb://localhost/mail-queuer');

2. 创建一个发送邮件的函数

通常一个发送邮件的函数如下所示，在`options`参数中，提供`options.subject`(邮件主题)、`options.html`(邮件内容)、`options.to`(收件)、

    function sendMail(options, callback){
      //发送邮件
      callback();
    };

如果你的项目中有使用nodemailer，你也可以这样：

    function sendMail(options, callback){
      var transport = nodemailer.createTransport("SMTP", {
        service: "Gmail",
        auth: {
          user: "your@gmail.com",
          pass: "password"
        }
      });

      transport.sendMail({
        from: "your@gmail.com",   //发件人，一般要和user一致
        to: options.receiver,           // 收件人
        subject: options.subject, //邮件主题
        html: options.html        //邮件内容
      }, function(err, res){
        transport.close();
        callback(err);
      });
    };

3. 在configure中，初始化中间件

    var options = {
      //模板路径
      templatePath: __dirname + "/template/",
      //模板对应的配置
      templateSubject: {
        "welcome": {
          "en": "Welcome %name%",
          "zh_CN": "欢迎%name%"
        }
      },
      //每发一份邮件，休息多长的时间再发送
      sleep: 5,
      //限制指定IP才能发起邮件请求
      ip: null,
      //握手的token，用于校验发起请求方
      token: "conis",

    };
    app.use(mailQueuer.initialize(mongoose, options, sendMail));

4. 添加新建邮件任务的路由

    app.get("/addTask", function(req, res, next){
      mailQueuer.newTask(req, res, next);
    });

### 参数说明

1. `templatePath`：模板的绝对路径
2. `sleep`：每发一份邮件中断多久，有些邮件服务器可能会禁止频繁发邮件的，如果邮件服务器是自己的就不用考虑了
3. `ip`：限制请求服务器的ip数组，允许是正则表达式
4. `token`：校验请求服务器的token
5. `templateSubject`：邮件主题的模板

### 请求服务器

请求服务器只需要发送一个post请求过去就可以，需要提供的数据为`token`、`subject`(邮件主题的JSON数据)、`data`(邮件内容的JSON数据)、`template`(使用哪个模板)、`language`（语言，默认为en）。

## Examples

请见 ./examples/app.js

## Credits

  - [Conis Yi](http://github.com/conis)

## License

[The MIT License](http://opensource.org/licenses/MIT)

Copyright (c) 2012-2013 Conis Yi <[http://iove.net/](http://iove.net/)>
