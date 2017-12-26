const client = require('cheerio-httpcli');

var DOMParser = require('dom-parser');
var fs = require('fs');
var AWS = require('aws-sdk');

var request = require('request');

//test room
//const CHATWORK_ROOM_ID = '92144693';
//my room
const CHATWORK_ROOM_ID = '48953415';
//const CHATWORK_TOKEN = '';
// my token
const CHATWORK_TOKEN = '';

var fDate = 'writetest.txt';

AWS.config.update({
    accessKeyId: "",
    secretAccessKey: "",
    region: 'ap-northeast-1'
});

var s3 = new AWS.S3();

var S3InputParams = {
 Bucket: "forhtml",
 Key: 'testKey.txt'
};

var S3Params = {
 Bucket: "forhtml",
 Key: 'testKey.txt',
 Body: fDate
};

var strHtml = '';


exports.scrapeYahoo.rss = (event, context, callback) => {
    var p = client.fetch('https://auctions.yahoo.co.jp/store/notice/rss20.xml')
    p.then(function (result) {
      console.log('start');
      var form = result.$('form[name=login_form]');

      form.field({
        user_name: '',
        password: ''
      });

      form.find('input[type=submit]').click(function (err, $, res, body) {
        var form_sub = $('form[name=login_form]');

        form_sub.field({
          user_name: '',
          password: ''
        });

        form_sub.find('input[type=submit]').click(function (err_sub, $, res_sub, body_sub) {
          strHtml = body_sub;
          getPreDate();
        });
      });
    })

    p.catch(function (err) {
      console.log("catch:" + err);
    });

    p.finally(function () {
      console.log('done');
    })
}

function printRss(preDate){
    var parser = new DOMParser();
    var dom = parser.parseFromString(strHtml, 'text/xml');
    var rawDate = dom.getElementsByTagName('lastBuildDate');
    var strLastBuildDate = getUTCDate(rawDate[0].textContent);
    var strMessage = '';

    if(strLastBuildDate == preDate){
        strMessage = "最新記事の更新日:" + strLastBuildDate;
        strMessage += "\n新しい記事はありません。";
        sendChatMessage('', strMessage);
    }

    if(preDate.length > 0 && strLastBuildDate == preDate){
        return '';
    }

    var ele = dom.getElementsByTagName('item');

    var strTitle = "";
    var strDescription = "";

    for(no in ele){
        ele_obj = ele[no];

        for(sub_no in ele_obj.childNodes){
            sub_ele = ele_obj.childNodes[sub_no];

            if(sub_ele.nodeName == 'title'){
                strTitle = sub_ele.textContent;
            }

            if(sub_ele.nodeName == 'description'){
                strDescription = getUnEscapeHTML(sub_ele.textContent);
            }

            if(sub_ele.nodeName == 'pubDate'){
                if(strLastBuildDate == getUTCDate(sub_ele.textContent)){
                    sendChatMessage(strTitle, strDescription);

                    //S3 upload
                    S3Params.Body = strLastBuildDate;
                    s3.putObject(S3Params, function(err, data) {
                      if (err) console.log(err, err.stack);
                    });

                    return strLastBuildDate;
                }
            }
        }
    }

    sendChatMessage(strMessage);
}



function getUTCDate(localDate){
    var date = new Date(localDate);
    date.toUTCString();
    return date.getFullYear() + "/" + (date.getMonth() + 1) + "/" + date.getDate() + " " + getZeroPadding(date.getHours()) + ":" + getZeroPadding(date.getMinutes()) + ":" + getZeroPadding(date.getSeconds());
}

function getZeroPadding(pNoPadding){
    return ("0" + pNoPadding).slice(-2);
}

// -----で改行も追加
function getUnEscapeHTML(strHTML){
    var str = strHTML.replace(/ ■/g, "\n■");
    str = str.replace(/ ・/g, "\n・");
    str = str.replace(/[^-]([-]+)[^-]/g, "\n$1\n");
    str = str.replace(/　（/g, "\n（");
    str = str.replace(/(（[1-9]）)/g, "\n$1");
    str = str.replace(/([①-⑩])/g, "\n$1");

    return str
            .replace(/(&lt;)/g, '<')
            .replace(/(&gt;)/g, '>')
            .replace(/(&quot;)/g, '"')
            .replace(/(&#39;)/g, "'")
            .replace(/(&amp;)/g, '&');
}


function getPreDate(){
    var s3Stream = s3.getObject(S3InputParams).createReadStream();

    s3Stream.setEncoding('utf-8');

    s3Stream.on('data', function(chunk) {
      printRss(chunk);
    }).
    on('error', function(response) {
      printRss('');
    });
}


function sendChatMessage(strTitle, strBodyMessage){
    var strHeadMessage = "[info][title]" + strTitle +"  <ヤフオクRSS連絡>[/title]";
    var strTailMessage = "[/info]";
    var strMessage = strHeadMessage + strBodyMessage + strTailMessage;

    var chatwork_options = {
        url: 'https://api.chatwork.com/v2/rooms/' + CHATWORK_ROOM_ID + '/messages',
        headers: {
            'X-ChatWorkToken': CHATWORK_TOKEN
        },
        form: { body: strMessage },
        json: true
    };

    request.post(chatwork_options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log('post:' + body);
        }else{
            console.log('error: '+ response.statusCode);
        }
    });
}

