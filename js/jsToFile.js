// 'use strict';
// content is the data (a string) you'll write to file.
// filename is a string filename to write to on server side.
// This function uses iFrame as a buffer, it fills it up with your content
// and prompts the user to save it out.

exports.saveToFile = function save_content_to_file(content, filename){
    var dlg = false;
    with(document){
     ir=createElement('iframe');
     ir.id='ifr';
     ir.location='about.blank';
     ir.style.display='none';
     body.appendChild(ir);
      with(getElementById('ifr').contentWindow.document){
           open("text/plain", "replace");
           charset = "utf-8";
           write(content);
           close();
           document.charset = "utf-8";
           dlg = execCommand('SaveAs', false, filename);
       }
       body.removeChild(ir);
     }
    return dlg;
}

//BakedGoods

bakedGoods.set({
    data: [{key: "/temp/test.txt", value: "Hello world!", dataFormat: "text/plain"}],
    storageTypes: ["fileSystem"],
    options: {fileSystem:{storageType: Window.PERSISTENT}},
    complete: function(byStorageTypeStoredItemRangeDataObj, byStorageTypeErrorObj){}
  });

  bakedGoods.get({
    data: ["/temp/test.txt"],
    storageTypes: ["fileSystem"],
    options: {fileSystem:{storageType: Window.PERSISTENT}},
    complete: function(resultDataObj, byStorageTypeErrorObj){}
  });



// local storage


var obj = JSON.parse(localStorage.getItem('myStorage'));
console.log(obj.audi);

 // var obj = {"audi": "r8", "color": "black"};
    // localStorage.setItem('myStorage', JSON.stringify(obj)); 