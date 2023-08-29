const gc = Number(location.href.match(/gc=(\d+)/)[1] || 0);

const accessor = Object.getOwnPropertyDescriptor(
    XMLHttpRequest.prototype,
    "responseText"
);

Object.defineProperty(XMLHttpRequest.prototype, "responseText", {
    get: function () {
        let response = accessor.get.call(this);
        try {
            const data = JSON.parse(response);
            if (data.join || data.create || data.manage) {
                data.join = data.join || [];
                data.join = data.join.filter((e) => e.gc === gc);

                data.create = data.create || [];
                data.create = data.create.filter((e) => e.gc === gc);

                data.manage = data.manage || [];
                data.manage = data.manage.filter((e) => e.gc === gc);

                response = JSON.stringify(data);
                const groups = data.join.concat(data.create, data.manage);
                const groupName = groups.length ? groups[0].gn : "";
                document.title = "群成员管理 - " + groupName + "(" + gc + ")";
            }
        } catch (e) {
            console.log(e);
        }
        return response;
    },
    set: function (str) {
        return accessor.set.call(this, str);
    },
    configurable: true,
    enumerable: true,
});
