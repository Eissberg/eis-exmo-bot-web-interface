'use strict';
//Menlo, Source Code Pro, Fira Code, Hack, Segoe UI, Roboto, Segoe UI Semibold, Trebuchet MS
//сайт jsonplaceholder.typicode.com
// для роботи скрипту в Head частині сайту необхідно підключити: 
//<script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.js"></script>
//fetchExmo підключати перед закрыттям тега Body і перед основным скриптом   

var 
    config = {
        url: "https://api.exmo.com/v1.1/",
        key: "",
        secret: ""
    },
    MakedDecision = {
        
    };
 
var myData = JSON.parse(JSON.stringify(dataE));  //спрощене отримання данних з зовнішнього файлу

var pairSettings = JSON.parse(JSON.stringify(dataPairs));

var rsiSettings = JSON.parse(JSON.stringify(rsiSettings));

//асинхронний POST запит
const asyncPOST = async (url, data) => {
    const res = await fetch(url, data);
    return await res.json();
};

//асинхронний GET запит
const asyncGET = async (url) => {
    const res = await fetch(url);
    return res;
};

//функція читання зовнішнього файлу. Ця функция також працює для завантаження файлів .html или .txt   ,  переорієнтовуючи параметр типу mime на "text/html" , "text/plain" и т.д.
function readTextFile(file, callback) {         
    var rawFile = new XMLHttpRequest();
    rawFile.overrideMimeType("application/json");
    rawFile.open("GET", file, true);
    rawFile.onreadystatechange = function() {
        if (rawFile.readyState === 4 && rawFile.status == "200") {
            callback(rawFile.responseText);
        }
    }
    rawFile.send(null);
}

config.key = myData.apiKey;
config.secret = myData.apiSecret;

config.nonce = Math.floor(new Date().getTime());

// формування підпису для тіла запиту
function sign(message){
    return CryptoJS.HmacSHA512(message, config.secret).toString(CryptoJS.enc.hex);
}

//формування адреси посилання для запиту
function serialize(obj) {
    var str = [];
    for(var p in obj)
        if (obj.hasOwnProperty(p)) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
    return str.join("&");
}

//функція запиту на біржу. Парметри: method - метод виклику(GET, POST), reqName - параметр виклику, data - дані для параметру; callback //
async function callExmo(method, reqName, data, callback) {
    data.nonce = config.nonce++;
    var post_data = serialize(data);
    
    var apiSecret = sign(post_data);
    var apiKey = config.key;

    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
    myHeaders.append("Key", apiKey);
    myHeaders.append("Sign", apiSecret);

    var urlencoded = new URLSearchParams();
    let key, requestOptions;
    for (key in data) {
        urlencoded.append(key.toString(), data[key].toString()); 
    }

    if (method == "POST") {
        requestOptions = {
            method: method,
            headers: myHeaders,
            body: urlencoded,
            redirect: 'follow'
        };
        
        await asyncPOST(`${config.url}${reqName}`,requestOptions)
        .then(result => callback(result))
        .catch(error => console.log('error', error)); 
    } else {
        requestOptions = {
            method: method,
            redirect: 'follow'
        };
        
        await asyncPOST(`${config.url}${reqName}?${post_data}`,requestOptions)
        .then(result => callback(result))
        .catch(error => console.log('error', error));
    }
}

//функція розрахунку EMA
async function backEMA(currentPair, analysisLength, timeFrame) {
    let fromDate = new Date(), //отримуємо поточну дату
        toDate = new Date(),   //отримуємо поточну дату 
        array = [],
        closeSumm = 0,
        elemNum = 0,
        iSMA = 0,
        iEMAarray = [],
        iEMA = 0;

    fromDate = Math.trunc(fromDate/1000-(analysisLength*2)*timeFrame*60);
   
    toDate = Math.trunc(toDate/1000);

    await callExmo("GET","candles_history", {symbol: currentPair, resolution: timeFrame, from: fromDate, to: toDate}, result => {
        array = result.candles;
    }); 

    array.forEach ((e,i) => {
        if (i < analysisLength) {
            // рахуємо SMA
            closeSumm = closeSumm + e.c;
            elemNum ++;
            iSMA = +(closeSumm / elemNum).toFixed(2);
        } else {
            // рахуємо EMA
            if (i == analysisLength) {
                iEMAarray[i-analysisLength] = +(iSMA).toFixed(2);
            } else {    
                iEMAarray[i-analysisLength] = +((e.c - iEMAarray[i-(analysisLength+1)]) * (2 / (elemNum  + 1)) + iEMAarray[i-(analysisLength+1)]).toFixed(2);
            }
        }
    });
    
    iEMA = iEMAarray[array.length-(analysisLength+1)];

    return iEMA;
}

//функція отримання команд на продажж/закупку на основі аналітичного індикатора RSI
async function backCommandRSI(currentPair, iter=0) {
    let fromDate = new Date(), //отримуємо поточну дату
        toDate = new Date(),   //отримуємо поточну дату 
        nowDate = new Date(),
        analysisLength = rsiSettings.analysisLength,
        shortFrame = rsiSettings.shortTimeFrame,
        longFrame = rsiSettings.longTimeFrame,
        resArr = [],
        resMass = [],
        closeGreen = 0,
        closeRed = 0,
        RSI = 0,
        RSI120 = 0,
        priceBegin = 0,
        priceEnd = 0;
   
    fromDate = Math.trunc(nowDate/1000- (analysisLength+1)*shortFrame*60);
    toDate = Math.trunc(nowDate/1000);
    
    //отримуємо свічки для аналізу RSI 
    await callExmo("GET","candles_history", {symbol: currentPair, resolution: shortFrame, from: fromDate, to: toDate}, result => {
        resArr = result.candles;
    }); 

    for(let i = 0; i < resArr.length; i++) {
        if (i == 0) {
            resMass[i] = 0;
            priceBegin = resArr[i].c;
        } else {
            resMass[i] = resArr[i].c - resArr[i-1].c;
            if (resArr[i].c - resArr[i-1].c > 0) {
                closeGreen = closeGreen + (resArr[i].c - resArr[i-1].c);
            } else {
                closeRed = closeRed + -(resArr[i].c - resArr[i-1].c);
            }
            priceEnd = resArr[i].c;
        }
    }


    RSI = 100 - (100 / (1 + closeGreen / closeRed ));

    //Розраховуємо дивергенцію за короткотривалим аналізом
    if ((priceBegin - priceEnd < 0) && (pairSettings.rsi[iter] - RSI > 0)) {
        pairSettings.rsiDivergention[iter] = 'bear';
    } else {
        if ((priceBegin - priceEnd > 0) && (pairSettings.rsi[iter] - RSI < 0) ) {
            pairSettings.rsiDivergention[iter] = 'bull';
        } else {
            pairSettings.rsiDivergention[iter] = 'no';
        }
    }

    pairSettings.rsi[iter] = +RSI.toFixed(2);

    // if ((RSI > rsiSettings.lowLevel) && (pairSettings.rsiCommand[iter] == 'prepareToBuy')) {
    //     pairSettings.rsiCommand[iter] = 'forBuy';
    // } else {
    //     if ((RSI < rsiSettings.highLevel) && (pairSettings.rsiCommand[iter] == 'prepareToSell')) {
    //         pairSettings.rsiCommand[iter] = 'forSell';
    //     } else {
    //         if (RSI < rsiSettings.lowLevel) {
    //             pairSettings.rsiCommand[iter] = 'prepareToBuy';
    //         } else {
    //             if (RSI > rsiSettings.highLevel)  {
    //                 pairSettings.rsiCommand[iter] = 'prepareToSell';
    //             } else {
    //                 pairSettings.rsiCommand[iter] = 'noComm';
    //             }
    //         }
    //     }
    // }


    fromDate = Math.trunc(nowDate/1000-(analysisLength+1)*longFrame*60);
    toDate = Math.trunc(nowDate/1000);


    //отримуємо свічки для аналізу RSI120 
    await callExmo("GET","candles_history", {symbol: currentPair, resolution: longFrame, from: fromDate, to: toDate}, result => {
        resArr = result.candles;
    }); 

    resMass = [];
    closeGreen = 0;
    closeRed = 0;
    priceBegin = 0;
    priceEnd = 0;

    for(let i = 0; i < resArr.length; i++) {
        if (i == 0) {
            resMass[i] = 0;
            priceBegin = resArr[i].c;
        } else {
            resMass[i] = resArr[i].c - resArr[i-1].c;
            if (resArr[i].c - resArr[i-1].c > 0) {
                closeGreen = closeGreen + (resArr[i].c - resArr[i-1].c);
            } else {
                closeRed = closeRed + -(resArr[i].c - resArr[i-1].c);
            }
            priceEnd = resArr[i].c;
        }
    }

    RSI120 = 100 - (100 / (1 + closeGreen / closeRed ));

    //Розраховуємо дивергенцію за довготривалим аналізом
    if ((priceBegin - priceEnd < 0) && (pairSettings.rsi[iter] - RSI120 > 0)) {
        pairSettings.rsi120Divergention[iter] = 'bear';
    } else {
        if ((priceBegin - priceEnd > 0) && (pairSettings.rsi[iter] - RSI120 < 0) ) {
            pairSettings.rsi120Divergention[iter] = 'bull';
        } else {
            pairSettings.rsi120Divergention[iter] = 'no';
        }
    }

    pairSettings.rsi120[iter] = +RSI120.toFixed(2);

    //розраховуємо напрямок тренду за довготривалим rsi
    if (RSI120 > 50) {
        pairSettings.rsiTrend[iter] = 'ᐃ';
    } else {
        pairSettings.rsiTrend[iter] = 'ᐁ';
    }

    //розраховуємо команду враховуючи rsi, тренди та дивернецію

    if ((RSI > rsiSettings.lowLevel) && (pairSettings.rsiCommand[iter] == 'prepareToBuy')) {
        if (pairSettings.rsiTrend == 'ᐃ') {
            pairSettings.rsiCommand[iter] = 'forBuy';
        } else {
            pairSettings.rsiCommand[iter] = 'noComm';
            // console.log('Тренд ᐁ, притримаємо валюту до зміни тренду');
        }
        pairSettings.rsiCommand[iter] = 'forBuy';
    } else {
        if ((RSI < rsiSettings.highLevel) && (pairSettings.rsiCommand[iter] == 'prepareToSell')) {
            if (pairSettings.rsiTrend == 'ᐁ') {
                pairSettings.rsiCommand[iter] = 'forSell';
            } else {
                pairSettings.rsiCommand[iter] = 'noComm';
                // console.log('Тренд ᐃ, притримаємо валюту до зміни тренду');
            }
        } else {
            if (RSI < rsiSettings.lowLevel) {
                pairSettings.rsiCommand[iter] = 'prepareToBuy';
            } else {
                if (RSI > rsiSettings.highLevel)  {
                    pairSettings.rsiCommand[iter] = 'prepareToSell';
                } else {
                    pairSettings.rsiCommand[iter] = 'noComm';
                }
            }
        }
    }
}

//функція повертає рекомендацію на продаж чи покупку крипто-пари на основі визначених добових коливань(границь byBorder/sellBorder у налаштуваннях)
function backCommandForsale(leftBorder, rightBorder, iter=0) {
    
    if (rightBorder == 0) {
        rightBorder = leftBorder;
    }
    let 
        backCommand = '',   //тут повертаємо результат функції
        different = +((1-leftBorder/rightBorder)*100).toFixed(2);  //результат порівняння
    
    let nowDate = new Date();
    let shortTime = `${nowDate.toDateString()} ${nowDate.getHours()}:${nowDate.getMinutes()}:${nowDate.getSeconds()}`;
    
    putInCurrentStatus(shortTime);
    putInCurrentStatus(`${leftBorder} <> ${rightBorder} = ${different} %`);

    // putInCurrentStatus(`LastExComm.Was> ${pairSettings.lastExCommand[iter]}` );
    
    if (different >= +pairSettings.sellBorder[iter]*5) { //аналізуємо різницю між different та порогами для крипто пари
        // if (pairSettings.lastExCommand[iter] != 'forExtraSell') {
        //     backCommand = 'forExtraBuy';
        //     putInCurrentStatus(`Comm.> ${backCommand}, --${pairSettings.crSub[iter]}, +${pairSettings.crMain[iter]}`);
        //     pairSettings.lastExCommand[iter] = backCommand;
        //     //повертаємо команду на екстримальний продаж(сброс) якщо в Основі 
        // } else {
        //     backCommand = 'noComm';
        //     putInCurrentStatus(`Comm.<> ${backCommand}`);
            
        // }
        backCommand = 'forExtraBuy';
        pairSettings.lastExCommand[iter] = backCommand;
        putInCurrentStatus(`Comm.> ${backCommand}, --${pairSettings.crSub[iter]}, +${pairSettings.crMain[iter]}`);
    } else if (different <= +pairSettings.buyBorder[iter]*5) { //аналізуємо різницю між different та порогами для крипто пари 
        // if (pairSettings.lastExCommand[iter] != 'forExtraBuy') {
        //     backCommand = 'forExtraSell';
        //     putInCurrentStatus(`Comm.> ${backCommand}, --${pairSettings.crMain[iter]}, +${pairSettings.crSub[iter]}`);
        //     pairSettings.lastExCommand[iter] = backCommand;
        //     //повертаємо команду на екстримальну покупку(сброс) якщо в Підлеглому
        // } else {
        //     backCommand = 'noComm';
        //     putInCurrentStatus(`Comm.<> ${backCommand}`);  
        // }
        backCommand = 'forExtraSell';
        pairSettings.lastExCommand[iter] = backCommand;
        putInCurrentStatus(`Comm.> ${backCommand}, --${pairSettings.crMain[iter]}, +${pairSettings.crSub[iter]}`);
    } else if (different >= +pairSettings.sellBorder[iter]){   //аналізуємо різницю між different та порогами для крипто пари 
        backCommand = 'forSell';
        putInCurrentStatus(`Comm.> ${backCommand}, -${pairSettings.crMain[iter]}, +${pairSettings.crSub[iter]}`);
        //повертаємо команду на продаж якщо в Основі
    } else if (different <= +pairSettings.buyBorder[iter]) {    //аналізуємо різницю між different та порогами для крипто пари 
        backCommand = 'forBuy';
        putInCurrentStatus(`Comm.> ${backCommand}, -${pairSettings.crSub[iter]}, +${pairSettings.crMain[iter]}`);
        //повертаємо команду на покупку якщо в Підлеглому
    } else {
        backCommand = 'noComm';
        putInCurrentStatus(`Comm.<> ${backCommand}`);
    } 
    
    pairSettings.baseTradeDecision[iter] = backCommand;

    return backCommand;
}

//Фунекція отримання откритих ордерів
async function getOpenOrders(currentPair, iter=0) {
    let openOrders = {
        pair: currentPair
    };
    //Перевіряємо відкриті ордери по поточній парі
    await callExmo("POST","user_open_orders", {}, result => { 
        let resUOO = result;
        //Перевіряємо наявність відкритих ордерів
        if (resUOO[currentPair] == undefined) {              
            openOrders.openOrder = 'none';
            putInCurrentStatus(`По парі ${currentPair} немає відкритих ордерів!`);
        } else {
            openOrders.openOrder = resUOO[currentPair];     //Вносимо інформацію про ордели до аналітичного обьекту
            putInCurrentStatus(`По парі ${currentPair} є ордери. Анализуємо!`);
        }
    });  
    return openOrders;
}

//Заповнення табличної частини з порівняння двох останніх ордерів та порівняння останнього ордеру з поточною ціною
async function getBalance (currentPair, iter=0) {
    let toDateNow = new Date(),   //отримуємо дату
        nowCost = 0,                //поточная ціна
        resUT = [],
        resUTfold = [{},{},{},{},{},{},{},{},{},{}],
        k=0,
        balanceCrMain = document.querySelector('#balance_crMain'),
        balanceCrSub = document.querySelector('#balance_crSub'),
        balanceMain = document.querySelector('#balance_Main'),
        balanceSub = document.querySelector('#balance_Sub'),
        lastOpType = document.querySelector('#last_operation_type'),
        lastOpRate = document.querySelector('#last_operation_rate'),
        lastOpBalanceMain = document.querySelector('#last_operation_balanceMain'),
        lastOpBalanceSub = document.querySelector('#last_operation_balanceSub'),
        currentRate = document.querySelector('#current_rate'),
        currentBalanceMain = document.querySelector('#current_balanceMain'),
        currentBalanceSub = document.querySelector('#current_balanceSub'),
        differenceRate = document.querySelector('#difference_rate'),
        differenceBalanceMain = document.querySelector('#difference_balanceMain'),
        differenceBalanceSub = document.querySelector('#difference_balanceSub'),

        lastOpTypeA = document.querySelector('#last_operation_type_a'),
        lastOpRateA = document.querySelector('#last_operation_rate_a'),
        lastOpBalanceMainA = document.querySelector('#last_operation_balanceMain_a'),
        lastOpBalanceSubA = document.querySelector('#last_operation_balanceSub_a'),
        prLastOpType = document.querySelector('#p_last_operation_type'),
        prLastOpRate = document.querySelector('#p_last_operation_rate'),
        prLastOpBalanceMain = document.querySelector('#p_last_operation_balanceMain'),
        prLastOpBalanceSub = document.querySelector('#p_last_operation_balanceSub'),
        prDifferenceRate = document.querySelector('#pl_difference_rate'),
        prDifferenceBalanceMain = document.querySelector('#pl_difference_balanceMain'),
        prDifferenceBalanceSub = document.querySelector('#pl_difference_balanceSub');
    
    //Перевіряємо наявність Валют на залишку у гаманці
    await callExmo("POST","user_info", {}, result => {
        let resUI = result.balances;
        pairSettings.mainBalance[iter] = +resUI[pairSettings.crMain[iter]];
        pairSettings.subBalance[iter] = +resUI[pairSettings.crSub[iter]];
        
    });

    // Отримуємо дані останньої проведеної операції
    await callExmo("POST","user_trades", {pair: "BTC_USD", limit: 10, offset: 0}, result => {       
        resUT = result[currentPair];
    });
        // Згортаємо дані по операціям, якщо вони виконувались декількома ордерами
        for (let i=0; i<resUT.length; i++) {
            let sumAmount = 0,
                sumComisAmount = 0,
                sumQuantity = 0;
                sumAmount = sumAmount + (+resUT[i].amount);
                sumComisAmount = sumComisAmount + (+resUT[i].commission_amount);
                sumQuantity = sumQuantity + (+resUT[i].quantity);
            for (let j=i+1; j<resUT.length; j++) {
                if (resUT[i].type == resUT[j].type){
                    sumAmount = sumAmount + (+resUT[j].amount);
                    sumComisAmount = sumComisAmount + (+resUT[j].commission_amount);
                    sumQuantity = sumQuantity + (+resUT[j].quantity);
                    i++;
                } else {
                    resUTfold[k].amount = sumAmount.toFixed(8);
                    resUTfold[k].client_id =  resUT[j-1].client_id;
                    resUTfold[k].commission_amount =  sumComisAmount.toFixed(8);
                    resUTfold[k].commission_currency = resUT[j-1].commission_currency;
                    resUTfold[k].commission_percent = resUT[j-1].commission_percent;
                    resUTfold[k].date = +resUT[j-1].date;
                    resUTfold[k].exec_type = resUT[j-1].exec_type;
                    resUTfold[k].order_id = +resUT[j-1].order_id;
                    resUTfold[k].pair = resUT[j-1].pair;
                    resUTfold[k].price = resUT[j-1].price;
                    resUTfold[k].quantity = sumQuantity.toFixed(8);
                    resUTfold[k].trade_id = +resUT[j-1].trade_id;
                    resUTfold[k].type = resUT[j-1].type; 
                    k++;     
                    break;
                }
            }
        }
     
    pairSettings.crLastTradesType[iter] = resUTfold[iter].type;
    pairSettings.crLastTradesPrice[iter] = +(+resUTfold[iter].price + (+resUTfold[iter].price*0.003)).toFixed(2);
    pairSettings.crLastTradesQuantity[iter] = +resUTfold[iter].quantity;
    pairSettings.crPrLastTradesType[iter] = resUTfold[iter+1].type;
    pairSettings.crPrLastTradesPrice[iter] = +(+resUTfold[iter+1].price + (+resUTfold[iter+1].price*0.003)).toFixed(2);
    pairSettings.crPrLastTradesQuantity[iter] = +resUTfold[iter+1].quantity;
  

    // Отримуємо дані поточної вартості валюти
    await callExmo("GET","candles_history", {symbol: currentPair, resolution: '60', from: Math.trunc(+toDateNow/1000-3600), to: Math.trunc(+toDateNow/1000)}, result => {
        let res = result;
        nowCost = +res.candles[0].c;
        pairSettings.nowCost[iter] = nowCost;
    });

    balanceCrMain.textContent = pairSettings.crMain[iter];
    balanceCrSub.textContent = pairSettings.crSub[iter];
    balanceMain.textContent = (pairSettings.mainBalance[iter]).toFixed(7);
    balanceSub.textContent = (pairSettings.subBalance[iter]).toFixed(2);

    lastOpType.textContent = pairSettings.crLastTradesType[iter];
    lastOpRate.textContent = pairSettings.crLastTradesPrice[iter];
    lastOpBalanceMain.textContent = (pairSettings.crLastTradesQuantity[iter]).toFixed(7);
    lastOpBalanceSub.textContent = (pairSettings.crLastTradesQuantity[iter] * pairSettings.crLastTradesPrice[iter]).toFixed(2);

    currentRate.textContent = pairSettings.nowCost[iter];
    currentBalanceMain.textContent = (pairSettings.mainBalance[iter] + (pairSettings.subBalance[iter] / pairSettings.nowCost[iter])).toFixed(7);
    currentBalanceSub.textContent = (pairSettings.subBalance[iter] + (pairSettings.mainBalance[iter] * pairSettings.nowCost[iter])).toFixed(2);

    differenceRate.textContent = ((1-(pairSettings.crLastTradesPrice[iter]/pairSettings.nowCost[iter]))*100).toFixed(2);
    
    if (((pairSettings.mainBalance[iter] + (pairSettings.subBalance[iter] / pairSettings.nowCost[iter])).toFixed(7) == 0) && ((pairSettings.subBalance[iter] + (pairSettings.mainBalance[iter] * pairSettings.nowCost[iter])).toFixed(2) == 0)) {
        differenceBalanceMain.textContent = 'у ордері';
        differenceBalanceSub.textContent = 'у ордері';
    }  else {
        differenceBalanceMain.textContent = ((1-((pairSettings.crLastTradesQuantity[iter])/(pairSettings.mainBalance[iter] + (pairSettings.subBalance[iter] / pairSettings.nowCost[iter]))))*100).toFixed(2);
    
        differenceBalanceSub.textContent = ((1-((pairSettings.crLastTradesQuantity[iter] * pairSettings.crLastTradesPrice[iter])/(pairSettings.subBalance[iter] + (pairSettings.mainBalance[iter] * pairSettings.nowCost[iter]))))*100).toFixed(2);
    }

    lastOpTypeA.textContent = pairSettings.crLastTradesType[iter];
    lastOpRateA.textContent = pairSettings.crLastTradesPrice[iter];
    lastOpBalanceMainA.textContent = (pairSettings.crLastTradesQuantity[iter]).toFixed(7);
    lastOpBalanceSubA.textContent = (pairSettings.crLastTradesQuantity[iter] * pairSettings.crLastTradesPrice[iter]).toFixed(2);

    prLastOpType.textContent = pairSettings.crPrLastTradesType[iter];
    prLastOpRate.textContent = pairSettings.crPrLastTradesPrice[iter];
    prLastOpBalanceMain.textContent = (pairSettings.crPrLastTradesQuantity[iter]).toFixed(7);
    prLastOpBalanceSub.textContent = (pairSettings.crPrLastTradesQuantity[iter] * pairSettings.crPrLastTradesPrice[iter]).toFixed(2);

    prDifferenceRate.textContent = ((1-(pairSettings.crPrLastTradesPrice[iter]/pairSettings.crLastTradesPrice[iter]))*100).toFixed(2);
    prDifferenceBalanceMain.textContent = ((1-((pairSettings.crPrLastTradesQuantity[iter])/(pairSettings.crLastTradesQuantity[iter])))*100).toFixed(2);
    prDifferenceBalanceSub.textContent = ((1-((pairSettings.crPrLastTradesQuantity[iter] * pairSettings.crPrLastTradesPrice[iter])/(pairSettings.crLastTradesQuantity[iter] * pairSettings.crLastTradesPrice[iter])))*100).toFixed(2);

}

//Функція отримання поточного курсу та запису його у аналітичний об'єкт
async function getNowCost (currentPair, iter=0) {
    let toDateNow = new Date();             //получаем дату

        await callExmo("GET","candles_history", {symbol: currentPair, resolution: '60', from: Math.trunc(+toDateNow/1000-3600), to: Math.trunc(+toDateNow/1000)}, result => {
            let res = result;
            pairSettings.nowCost = res.candles[0].c;
        });
}

//Функція закриття усіх активних ордерів
async function cancelOrders(currentPair, iter =0) {
    let openOrders = await getOpenOrders(currentPair, iter);
    
    if (openOrders.openOrder != 'none') {
        openOrders.openOrder.forEach(e => {
            putInCurrentStatus(`Пара ${currentPair} Відкрито ордер ${e.order_id}, тип ${e.type}. Закриваємо!`);
            callExmo("POST","order_cancel", {order_id: e.order_id}, result => {
                console.log(result);
                if (result.result == true) {
                    putInCurrentStatus("Успішно!");
                } else {    
                    putInCurrentStatus(result.error);
                }
            });
        });
    }
}

//Функція продажу Main(головної) валюти з параметром 'cancellation' = true - відміна поточного ордеру, якщо в наявності відкритий -USD +BTC
async function buyCurrentCurrency (currentPair, cancellation=false, iter=0) {
    let openOrders = await getOpenOrders(currentPair, iter),
        nowCost = 0,
        nowDate = new Date();

    //Перевіряємо наявність відкритих ордерів
    if (openOrders.openOrder != 'none') {
        if (cancellation == true) {
            await cancelOrders(currentPair, iter);
        } else {
            openOrders.openOrder.forEach(e => {
                if (e.type == 'buy') {
                    putInCurrentStatus(`${currentPair} відкрпто ордер ${e.order_id} тип: ${e.type}. Чекаємо!`);
                    putInTransactions(`${currentPair} відкрито ордер ${e.order_id} тип: ${e.type}. Чекаємо!`);
                } else if (e.type == 'sell') {
                    putInCurrentStatus(`${currentPair} віжкрито ордер ${e.order_id} тип: ${e.type}. Закриваємо!`);
                    putInTransactions(`${currentPair} відкрито ордер ${e.order_id} тип: ${e.type}. Закриваємо!`);
                    callExmo("POST", "order_cancel", {
                        order_id: e.order_id
                    }, result => {
                        if (result.result == true) {
                            putInCurrentStatus("Успішно!");
                            putInTransactions("Успішно!");
                        } else {
                            putInCurrentStatus(result.error);
                            putInTransactions(result.error);
                        }
                    });
                }
            });

        }
    }

    if (pairSettings.nowCost == 0) {
        await getNowCost(currentPair, iter);
    } else {
        nowCost = pairSettings.nowCost[iter];
    }

    //проверяем баланс
    if (pairSettings.subBalance[iter] > 0 && pairSettings.subBalance[iter] / nowCost.toFixed(pairSettings.crPrisePrec[iter]) >= pairSettings.crMinQuant[iter]) {
        //создаем ордер buy
        let operQuantity = ((pairSettings.subBalance[iter] / nowCost.toFixed(pairSettings.crPrisePrec[iter])).toFixed(8)) - ((pairSettings.subBalance[iter] / nowCost.toFixed(pairSettings.crPrisePrec[iter])).toFixed(8) / 100 * 0.002), //Робимо зазор у 0,02% щоб вистачало залишку на рахунку
            operPrice = nowCost.toFixed(pairSettings.crPrisePrec[iter]);

        callExmo("POST", "order_create", {
            pair: currentPair,
            quantity: operQuantity,
            price: operPrice,
            type: "buy"
        }, result => {
            console.log(result);
            putInTransactions(`${nowDate.toDateString()} ${nowDate.getHours()}:${nowDate.getMinutes()}:${nowDate.getSeconds()}`);
            if (result.result == true) {
                putInCurrentStatus("Успішно!");
                putInTransactions("Успішно!");
            } else {
                putInCurrentStatus(result.error);
                putInTransactions(result.error);
            }
        });
    } else {
        putInCurrentStatus(`Недостатня кількість ${pairSettings.crSub[iter]} для відкриття ордеру!`);
    }
}

//Функція продажу Sum(підлеглої) валюти з параметром 'cancellation' = true - відміна поточного ордеру, якщо в наявності відкритий -BTC +USD
async function sellCurrentCurrency (currentPair, cancellation=false, iter=0) {
    let openOrders = await getOpenOrders(currentPair, iter),
        nowCost = 0, 
        nowDate = new Date();
    //Перевіряємо наявність відкритих ордерів
    if (openOrders.openOrder != 'none') {
        if (cancellation == true) {
            await cancelOrders(currentPair, iter);
        } else {
            openOrders.openOrder.forEach(e => {
                if (e.type == 'sell') {
                    putInCurrentStatus(`${currentPair} відкрито ордер ${e.order_id} тип: ${e.type}. Чекаємо!`);
                    putInTransactions(`${nowDate.toDateString()} ${nowDate.getHours()}:${nowDate.getMinutes()}:${nowDate.getSeconds()}`);
                    putInTransactions(`${currentPair} відкрито ордер ${e.order_id} тип: ${e.type}. Чекаємо!`);
                } else if (e.type == 'buy') {
                    putInCurrentStatus(`${currentPair} відкрито ордер ${e.order_id} тип: ${e.type}. Закриваємо!`);
                    putInTransactions(`${nowDate.toDateString()} ${nowDate.getHours()}:${nowDate.getMinutes()}:${nowDate.getSeconds()}`);
                    putInTransactions(`${currentPair} відкрито ордер ${e.order_id} тип: ${e.type}. Закриваємо!`);
                    callExmo("POST","order_cancel", {order_id: e.order_id}, result => {
                        console.log(result);
                        if (result.result == true) {
                            putInCurrentStatus("Успішно!");
                            putInTransactions("Успішно!");
                        } else {    
                            putInCurrentStatus(result.error);
                            putInTransactions(result.error);
                        }
                    });
                }
            });
        }
    }
    
    if (pairSettings.nowCost == 0) {
       await getNowCost(currentPair, iter); 
    } else {
        nowCost = pairSettings.nowCost[iter];
    }

    //проверяем баланс
    if (pairSettings.mainBalance[iter] > 0 && pairSettings.mainBalance[iter] >=  pairSettings.crMinQuant[iter]) {
        //создаем ордер sell
        let operQuantity = pairSettings.mainBalance[iter],
            operPrice = nowCost.toFixed(pairSettings.crPrisePrec[iter]);

        callExmo("POST","order_create", {pair: currentPair, quantity: operQuantity, price: operPrice, type: "sell"}, result => {
            console.log(result);
            putInTransactions(`${nowDate.toDateString()} ${nowDate.getHours()}:${nowDate.getMinutes()}:${nowDate.getSeconds()}`);
            if (result.result == true) {
                putInCurrentStatus("Успішно!");
                putInTransactions("Успішно!");
            } else {    
                putInCurrentStatus(result.error);
                putInTransactions(result.error);
            }
        });
    } else {
        putInCurrentStatus(`Недостатня кількість ${pairSettings.crMain[iter]} для відкриття ордеру!`);
    }

}

// Базово-граничний аналіз (опис знаходиться у хелпі боту)
async function firstStrategy(currentPair, iter=0) {
    console.time('one');
    let  baseCost = pairSettings.lastBaseCost[iter],
         nowCost = 0;
    
    if (pairSettings.nowCost == 0) {
        await getNowCost(currentPair, iter);
    } else {
        nowCost = pairSettings.nowCost[iter];
    }

    if (baseCost == 0) {                //робимо перевірку на пустий параметр - при першому запуску. Якщо базова вартість пуста - беремо значення на початок поточного дня
        let fromDateStart = new Date(), //отримуємо дату 
            toDateStart = new Date(); //отримуємо дату

        fromDateStart.setHours(0, -1, 0, 0); //корекруємо години дати from 
        toDateStart.setHours(0, 0, 0, 0); //корекруємо години дати to

        await callExmo("GET","candles_history", {symbol: currentPair, resolution: '60', from: Math.trunc(+fromDateStart/1000), to: Math.trunc(+toDateStart/1000)}, result => {
            let res = result;
            baseCost = +((res.candles[0].h + res.candles[0].l) / 2).toFixed(8);
            pairSettings.lastBaseCost[iter] = baseCost;
        });
    }

    let command = backCommandForsale(baseCost,nowCost,0);

    // let openOrders = await getOpenOrders(currentPair, iter);
    await getBalance(currentPair, iter);

    // putInCurrentStatus(`${pairSettings.crMain[iter]} <> ${pairSettings.mainBalance[iter].toFixed(8)}`);
    // putInCurrentStatus(`${pairSettings.crSub[iter]} <> ${pairSettings.subBalance[iter].toFixed(2)}`);
    
    switch (command) {
        case 'forBuy':
            
            await buyCurrentCurrency (currentPair, false, 0);
            break;

        case 'forSell':
            
            await sellCurrentCurrency (currentPair, false, 0);
            break;

        case 'forExtraBuy':

            // await buyCurrentCurrency (currentPair, true, 0);
            pairSettings.lastBaseCost[iter] = nowCost;
            break;

        case 'forExtraSell':

            // await sellCurrentCurrency (currentPair, true, 0);
            pairSettings.lastBaseCost[iter] = nowCost;
            break;

        default:

            putInCurrentStatus(`Базови аналіз: Немає команд для торгівлі!`);
            break;
    }
    console.timeEnd('one');
}

// RSI14 аналіз (опис знаходиться у хелпі боту) 
async function secondStrategy(currentPair, iter=0) {
    console.time('two'); 
    
    let command = pairSettings.rsiCommand[iter];

    switch (command) {
        case 'forBuy':
            
            await buyCurrentCurrency (currentPair, false, 0);
            break;

        case 'forSell':
            
            await sellCurrentCurrency (currentPair, false, 0);
            break;

        default:

            putInCurrentStatus(`RSI: Немає команд для торгівлі!`);
            break;
    }

    console.timeEnd('two');
}

// Тест алгоритм (опис знаходиться у хелпі боту)
async function thirdStrategy(currentPair, iter=0) {
    console.time('three');
        
    await callExmo('POST','trades',{pair: currentPair},result => {
        let resT = result, key=0, bCount=0, sCount=0, bSum=0, sSum=0; 
        //Розбираємо масив із 100 останніх операцій на два масиви: масив ордерів закупки та масив ордерів продажу
        for(key in resT[currentPair]) {
            if (resT[currentPair][key].type == 'buy') { //заповнюємо масив ордерів з відміткою buy
                pairSettings.crBuyFrom100[iter][bCount] = +resT[currentPair][key].price; //заповнюємо ціни закупки
                bSum = bSum + (+resT[currentPair][key].price); //рахуємо суму загальну для розрахунку середнього
                bCount++; //рахуємо кількість загальну для розрахунку серенього
            } else {    //заповнюємо масив ордерів з відміткою sell
                pairSettings.crSellFrom100[iter][sCount] = +resT[currentPair][key].price; //заповнюємо ціни продажу
                sSum = sSum + (+resT[currentPair][key].price); //рахуємо суму загальну для розрахунку середнього
                sCount++; //рахуємо кількість загальну для розрахунку серенього
            }
        }
        pairSettings.crPriceBuyMin[iter] = pairSettings.crBuyFrom100[iter][0]; //записуємо мінімальну ціну закупки 
        pairSettings.crPriceSellMax[iter] = pairSettings.crSellFrom100[iter][0]; //записуємо максимальну ціну продажу
    });
        
    await callExmo("POST","user_trades", {pair: currentPair, limit: 1, offset: 0}, result => { //аналізуємо останній ордер
        let resUT = result;
        pairSettings.crLastTradesType[iter] = resUT[currentPair][iter].type;
        pairSettings.crLastTradesPrice[iter] = (+resUT[currentPair][iter].price).toFixed(2);
    });
        
    let baseCost = +pairSettings.crLastTradesPrice[iter], 
        nowCost = 0;

    await getBalance(currentPair, iter);
    await cancelOrders(currentPair, iter);   
        
        if (pairSettings.crLastTradesType[iter] == 'buy') {
            nowCost = +(+pairSettings.crPriceSellMax[iter] + (+pairSettings.crPriceSellMax[iter]*0.003)).toFixed(2);
        }  else {
            nowCost = +(+pairSettings.crPriceBuyMin[iter] - (+pairSettings.crPriceBuyMin[iter]*0.003)).toFixed(2);
        }
        
        putInCurrentStatus(`${pairSettings.crMain[iter]} <> ${+pairSettings.mainBalance[iter].toFixed(8)}`);
        putInCurrentStatus(`${pairSettings.crSub[iter]} <> ${+pairSettings.subBalance[iter].toFixed(2)}`);
    

    if (pairSettings.crLastTradesType[iter] == 'buy') {//останній ордер buy, тож створюжмо ордер sell
        //проверяем баланс
        if (pairSettings.mainBalance[iter] > 0 && pairSettings.mainBalance[iter] >=  pairSettings.crMinQuant[iter]) {
            //создаем ордер sell
            let operQuantity = pairSettings.mainBalance[iter],
                operPrice = nowCost.toFixed(+pairSettings.crPrisePrec[iter]);
    
                callExmo("POST","order_create", {pair: currentPair, quantity: operQuantity, price: operPrice, type: "sell"}, result => {
                    putInCurrentStatus(result);
                });
        }

    } else if (pairSettings.crLastTradesType[iter] == 'sell') {//останній ордер buy, тож створюжмо ордер buy
        //проверяем баланс
        if (pairSettings.subBalance[iter] > 0 && pairSettings.subBalance[iter]/nowCost.toFixed(+pairSettings.crPrisePrec[iter]) >= pairSettings.crMinQuant[iter]) {
            //создаем ордер buy
            let operQuantity = ((pairSettings.subBalance[iter]/nowCost.toFixed(pairSettings.crPrisePrec[iter])).toFixed(8)) - ((pairSettings.subBalance[iter]/nowCost.toFixed(pairSettings.crPrisePrec[iter])).toFixed(8) / 100 * 0.002), //Робимо зазор у 0,02% щоб вистачало залишку на рахунку
                operPrice = nowCost.toFixed(+pairSettings.crPrisePrec[iter]);
                
                callExmo("POST","order_create", {pair: currentPair, quantity: operQuantity, price: operPrice, type: "buy"}, result => {
                    putInCurrentStatus(result);
                });
        }
    } else {
        putInCurrentStatus("Немає відходящих ордерів!");
    }

    console.timeEnd('three');
}

function putInCurrentStatus(data){
    let brSize = document.getElementById('current_status').getElementsByTagName('br').length;
    
    if (brSize > ((CurStatHeigth/14)-1)) {                       // Построчный вывод на экран с переносом
        currentStatus.innerHTML = "";
        currentStatus.innerHTML += "> "+ data.toString() +"<br/>";
    } else {
        currentStatus.innerHTML += "> "+ data.toString() +"<br/>";
    }
        
}

function putInTransactions(data) {
    let brSize = document.getElementById('transactions').getElementsByTagName('br').length;
    
    if (brSize > ((TransactionsHeigth/14)-1)) {                       // Построчный вывод на экран с переносом
        transactions.innerHTML = "";
        transactions.innerHTML += "> "+ data.toString() +"<br/>";
      } else {
        transactions.innerHTML += "> "+ data.toString() +"<br/>";
      }
}


let fromDateStart = new Date(), //отримуємо дату 
    toDateStart = new Date(); //отримуємо дату

fromDateStart.setHours(0, -1, 0, 0); //корекруємо години дати from 
toDateStart.setHours(0, 0, 0, 0); //корекруємо години дати to


const btnStart1 = document.querySelector('#BtnStart1'),
      btnStop1 = document.querySelector('#BtnStop1'),
      btnStart2 = document.querySelector('#BtnStart2'),
      btnStop2 = document.querySelector('#BtnStop2'),
      btnStart3 = document.querySelector('#BtnStart3'),
      btnStop3 = document.querySelector('#BtnStop3'),
      currentStatus = document.querySelector('#current_status'),
      transactions = document.querySelector('#transactions'),
      btnB1 = document.querySelector('#b1'),
      btnB2 = document.querySelector('#b2'),
      btnB3 = document.querySelector('#b3'),
      btnB4 = document.querySelector('#b4'),
      btnB5 = document.querySelector('#b5'),
      label1 = document.querySelector('#label1'),
      label2 = document.querySelector('#label2'),
      label3 = document.querySelector('#label3'),
      analysisBase = document.querySelector('#analysis_base'),
      analysisBCommand = document.querySelector('#analysis_b_command'),
      currentCourse = document.querySelector('#current_course'),
      diffByCourses = document.querySelector('#diff_by_courses'),
      analysisRsi = document.querySelector('#analysis_rsi'),
      analysisRCommand = document.querySelector('#analysis_r_command'),
      trandRSI = document.querySelector('#trand_rsi'),
      divergRSI = document.querySelector('#diverg_rsi');
      

    btnB2.innerHTML = `Продати ${pairSettings.crMain[0]}`;
    btnB3.innerHTML = `Продати ${pairSettings.crSub[0]}`;
    
    

let 
      CurStatHeigth = currentStatus.clientHeight,
      TransactionsHeigth = transactions.clientHeight;
     
currentStatus.textContent = "";
transactions.textContent = "";

let timerBut1, timerBut2, timerBut3, timerStop = false, 
    btnStartBlock = false, 
    btnStopBlock1 = true, 
    btnStopBlock2 = true, 
    btnStopBlock3 = true, 
    count = 0, 
    timerBalance;

    timerBalance = setTimeout(function tack() { //Запуск таймеру
        getBalance("BTC_USD", 0);
        backCommandRSI("BTC_USD", 0);

        analysisBase.innerHTML = pairSettings.lastBaseCost[0];
        if (pairSettings.lastBaseCost[0] != 0) {
            analysisBCommand.innerHTML = pairSettings.baseTradeDecision[0];
            currentCourse.innerHTML = pairSettings.nowCost[0];
            diffByCourses.innerHTML = ((1-(pairSettings.lastBaseCost[0]/pairSettings.nowCost[0]))*100).toFixed(2);
        }
        
        
        analysisRsi.innerHTML = pairSettings.rsi[0];
        analysisRCommand.innerHTML = pairSettings.rsiCommand[0];      
        if (pairSettings.rsiTrend[0] == 'ᐃ') {
            trandRSI.innerHTML = '<img class="arrow" src="img/up.png" alt="up">';    
        } else {
            if (pairSettings.rsiTrend[0] == 'ᐁ') {
                trandRSI.innerHTML = '<img class="arrow" src="img/down.png" alt="down">';
            } else {
                trandRSI.innerHTML = 'noTrend';
            }
        }
        
        // trandRSI.innerHTML = pairSettings.rsiTrend[0];
        
        
        if (pairSettings.rsiDivergention[0] == 'bull') {
            divergRSI.innerHTML = '<img class="images" src="img/bull.png" alt="bull">';
        } else {
            if (pairSettings.rsiDivergention[0] == 'bear') {
                divergRSI.innerHTML = '<img class="images" src="img/bear.png" alt="bear">';
            } else {    
                divergRSI.innerHTML = 'no';
            }
        }
        

        setTimeout(tack, 15000);
    });

    btnStart1.addEventListener('click', () => {
        if (btnStartBlock) { //если кнопка Старт заблокирована
            putInCurrentStatus('Для запуску даного алгоритму зупиніть активний');
        } else { //если кнопка Старт разблокирована
            label1.style.background = 'rgb(45, 119, 76)';
            timerStop = false;
            btnStopBlock1 = false;
            btnStopBlock2 = true;
            btnStopBlock3 = true;
           

            timerBut1 = setTimeout(function tickBut1() { // Запуск таймера 
                // Выполняемый код
                // console.log(`___________________________________________________________________________`);
                putInCurrentStatus(`------------------------------------------`);
                //########################################Запуск алгоритмів старт############################################
                
                firstStrategy("BTC_USD", 0); //запуск першого алгоритму
                
                ///########################################Запуск алгоритмів стоп############################################
                count++;

                if (timerStop == true) {
                    clearTimeout(timerBut1); //Остановка таймера
                } else {
                    setTimeout(tickBut1, 50000); //Установка интервала между запросами
                }
            });
            btnStartBlock = true;
        }

    });

    btnStop1.addEventListener('click', () => { // Обработка нажатия кнопки Стоп
        if (btnStopBlock1) {
            if (btnStopBlock1 && btnStopBlock2 && btnStopBlock3) {
                putInCurrentStatus('Немає запущених алгоритмів');
            } else {
                putInCurrentStatus('Для зупинки алгоритму скористайтесь його кнопкою');
            }
        } else {
            timerStop = true;
            btnStartBlock = false;
            label1.style.background = 'rgb(119, 45, 45)';
            btnStopBlock1 = true;
        }
    });

    btnStart2.addEventListener('click', () => {
        if (btnStartBlock) {    //если кнопка Старт заблокирована
            putInCurrentStatus('Для запуску даного алгоритму зупиніть активний');
        }  else {   //если кнопка Старт разблокирована
            label2.style.background = 'rgb(45, 119, 76)';
            timerStop = false;
            btnStopBlock1 = true;
            btnStopBlock2 = false;
            btnStopBlock3 = true;

            timerBut2 = setTimeout(function tickBut2() { // Запуск таймера 
                // Выполняемый код
                // console.log(`___________________________________________________________________________`);
                putInCurrentStatus(`------------------------------------------`);
                //########################################Запуск алгоритмів старт############################################

                secondStrategy("BTC_USD", 0); //запуск другого алгоритму

                ///########################################Запуск алгоритмів стоп############################################
                count++;

                if (timerStop == true) {
                    clearTimeout(timerBut2); //Остановка таймера
                } else {
                    setTimeout(tickBut2, 50000); //Установка интервала между запросами
                }
            });
            btnStartBlock = true;
        }
    });

    btnStop2.addEventListener('click', () => { // Обработка нажатия кнопки Стоп
        if (btnStopBlock2) {
            if (btnStopBlock1 && btnStopBlock2 && btnStopBlock3) {
                putInCurrentStatus('Немає запущених алгоритмів');
            } else {
                putInCurrentStatus('Для зупинки алгоритму скористайтесь його кнопкою');
            }
        } else {
            timerStop = true;
            btnStartBlock = false;
            label2.style.background = 'rgb(119, 45, 45)';
            btnStopBlock2 = true;
        }
        
    });

    btnStart3.addEventListener('click', () => {
        if (btnStartBlock) { //если кнопка Старт заблокирована
            putInCurrentStatus('Для запуску даного алгоритму зупиніть активний');
        } else { //если кнопка Старт разблокирована
            label3.style.background = 'rgb(45, 119, 76)';
            timerStop = false;
            btnStopBlock1 = true;
            btnStopBlock2 = true;
            btnStopBlock3 = false;

            timerBut3 = setTimeout(function tickBut3() { // Запуск таймера 
                // Выполняемый код
                // console.log(`___________________________________________________________________________`);
                putInCurrentStatus(`------------------------------------------`);
                //########################################Запуск алгоритмів старт############################################

                // thirdStrategy("BTC_USD", 0); //запуск третього алгоритму

                ///########################################Запуск алгоритмів стоп############################################
                count++;

                if (timerStop == true) {
                    clearTimeout(timerBut3); //Остановка таймера
                } else {
                    setTimeout(tickBut3, 50000); //Установка интервала между запросами
                }
            });
            btnStartBlock = true;
        }

    });

    btnStop3.addEventListener('click', () => { // Обработка нажатия кнопки Стоп
        if (btnStopBlock3) {
            if (btnStopBlock1 && btnStopBlock2 && btnStopBlock3) {
                putInCurrentStatus('Немає запущених алгоритмів');
            } else {
                putInCurrentStatus('Для зупинки алгоритму скористайтесь його кнопкою');
            }
        } else {
            timerStop = true;
            btnStartBlock = false;
            label3.style.background = 'rgb(119, 45, 45)';
            btnStopBlock3 = true;
        }
    });


    btnB1.addEventListener('click', () => {
        cancelOrders("BTC_USD",0);
    });

    btnB2.addEventListener('click', () => {
        sellCurrentCurrency ("BTC_USD", false, 0);
    });

    btnB3.addEventListener('click', () => {
        buyCurrentCurrency ("BTC_USD", false, 0);
    });

    btnB4.addEventListener('click', () => {
        putInCurrentStatus(`Базова ціна змінена з ${pairSettings.lastBaseCost[0]} на ${pairSettings.nowCost[0]}`);
        putInTransactions(`Базова ціна змінена з ${pairSettings.lastBaseCost[0]} на ${pairSettings.nowCost[0]}`);
        pairSettings.lastBaseCost[0] = pairSettings.nowCost[0];
    });

    btnB5.addEventListener('click', () => {
        putInCurrentStatus(`Базова ціна змінена з ${pairSettings.lastBaseCost[0]} на ${pairSettings.crLastTradesPrice[0]}`);
        pairSettings.lastBaseCost[0] = pairSettings.crLastTradesPrice[0];
    });

//modal start

    const modalTriggerHelp = document.querySelector('[data-modal-help]'),
          modalTriggerAboutUs = document.querySelector('[data-modal-aboutUs]'),
          modalTriggerHelp1 = document.querySelector('[data-modal-help-one]'),
          modalTriggerHelp2 = document.querySelector('[data-modal-help-two]'),
          modalTriggerHelp3 = document.querySelector('[data-modal-help-three]'),
          
          modalHelp = document.querySelector('.modal-help'),
          modalAboutUs = document.querySelector('.modal-aboutUs'),
          modalHelp1 = document.querySelector('.modal-help1'),
          modalHelp2 = document.querySelector('.modal-help2'),
          modalHelp3 = document.querySelector('.modal-help3'),
          
          modalCloseBtnHelp = document.querySelector('[data-close-help]'),
          modalCloseBtnAoutUs = document.querySelector('[data-close-aboutUs]'),
          modalCloseBtnHelp1 = document.querySelector('[data-close-help1]'),
          modalCloseBtnHelp2 = document.querySelector('[data-close-help2]'),
          modalCloseBtnHelp3 = document.querySelector('[data-close-help3]');

    modalTriggerHelp.addEventListener('click', () =>{
        modalHelp.classList.toggle('show');
        document.body.style.overflow = 'hidden';
    });

    modalTriggerAboutUs.addEventListener('click', () =>{
        modalAboutUs.classList.toggle('show');
        document.body.style.overflow = 'hidden';
    });

    modalTriggerHelp1.addEventListener('click', () =>{
        modalHelp1.classList.toggle('show');
        document.body.style.overflow = 'hidden';
    });

    modalTriggerHelp2.addEventListener('click', () =>{
        modalHelp2.classList.toggle('show');
        document.body.style.overflow = 'hidden';
    });

    modalTriggerHelp3.addEventListener('click', () =>{
        modalHelp3.classList.toggle('show');
        document.body.style.overflow = 'hidden';
    });

    
    function closeModalHelp() {
        modalHelp.classList.toggle('show');
        document.body.style.overflow = '';
    }

    function closeModalAboutUs() {
        modalAboutUs.classList.toggle('show');
        document.body.style.overflow = '';
    }

    function closeModalHelp1() {
        modalHelp1.classList.toggle('show');
        document.body.style.overflow = '';
    }

    function closeModalHelp2() {
        modalHelp2.classList.toggle('show');
        document.body.style.overflow = '';
    }

    function closeModalHelp3() {
        modalHelp3.classList.toggle('show');
        document.body.style.overflow = '';
    }

    modalCloseBtnHelp.addEventListener('click', closeModalHelp);

    modalCloseBtnAoutUs.addEventListener('click', closeModalAboutUs);

    modalCloseBtnHelp1.addEventListener('click', closeModalHelp1);

    modalCloseBtnHelp2.addEventListener('click', closeModalHelp2);

    modalCloseBtnHelp3.addEventListener('click', closeModalHelp3);



    modalHelp.addEventListener('click', (e) => {
        if (e.target === modalHelp) {
            closeModalHelp();
        }
    });

    modalAboutUs.addEventListener('click', (e) => {
        if (e.target === modalAboutUs) {
            closeModalAboutUs();
        }
    });

    modalHelp1.addEventListener('click', (e) => {
        if (e.target === modalHelp1) {
            closeModalHelp1();
        }
    });

    modalHelp2.addEventListener('click', (e) => {
        if (e.target === modalHelp2) {
            closeModalHelp2();
        }
    });

    modalHelp3.addEventListener('click', (e) => {
        if (e.target === modalHelp3) {
            closeModalHelp3();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && modalHelp.classList.contains('show')) {
            closeModalHelp();
        } else {
            if (e.code === 'Escape' && modalAboutUs.classList.contains('show')) {
                closeModalAboutUs();
            } else {
                if (e.code === 'Escape' && modalHelp1.classList.contains('show')) {
                    closeModalHelp1();
                } else {
                    if (e.code === 'Escape' && modalHelp2.classList.contains('show')) {
                        closeModalHelp2();
                    } else {
                        if (e.code === 'Escape' && modalHelp3.classList.contains('show')) {
                            closeModalHelp3();
                        }
                    }
                }
            }
        }

    });

//modal end

