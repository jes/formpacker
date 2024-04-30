class Formpack {
    name = null;
    nameHash = null;
    fields = [];

    workNum = null;
    factor = null;

    base62Alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    constructor(name) {
        this.name = name;
        this.nameHash = this._hashString(name);
    }

    // based on https://stackoverflow.com/a/7616484
    _hashString(s) {
        let hash = 0;
        if (s.length === 0) return hash;
        for (let i = 0; i < s.length; i++) {
            let chr = s.charCodeAt(i);
            hash = (((hash << 5) - hash) + chr) & 0xff;
        }
        return hash;
    }

    _addDigits(str) {
        for (const ch of str) {
            // TODO: throw exception if not numeric
            this._add(parseInt(ch), 11);
        }
        this._add(10, 11); // 10 = terminator
    }

    _removeDigits() {
        let str = "";
        while (true) {
            let i = this._remove(11);
            if (i == 10) // loop until we find the terminator
                break;
            str += "" + i;
        }
        return str;
    }

    numField(name) {
        this.fields.push({
            name: name,
            type: "num",
            add: function(value) {
                // split the value into strings for the integer and fractional part
                const strValue = "" + value;
                let parts = strValue.split(".", 2);
                while (parts.length < 2)
                    parts.push("");
                let intPart = parts[0];
                let fracPart = parts[1];

                // encode a sign bit
                if (intPart.startsWith("-")) {
                    this._add(1, 2);
                    intPart = intPart.slice(1);
                } else {
                    this._add(0, 2);
                }
                // encode the digits of each part
                this._addDigits(intPart);
                this._addDigits(fracPart);
            },
            remove: function() {
                let intPart = "";
                let fracPart = "";
                let negative = this._remove(2);
                let sign = negative ? "-" : "";
                intPart = this._removeDigits();
                fracPart = this._removeDigits();
                // TODO: suppress "." if fracPart is empty string
                return sign + intPart + "." + fracPart;
            },
        });
    }

    boolField(name) {
        this.fields.push({
            name: name,
            type: "bool",
            add: function(value) {
                this._add((value ? 1 : 0), 2);
            },
            remove: function() {
                return this._remove(2) == 1;
            },
        });
    }

    // https://stackoverflow.com/a/13691499
    _encode_utf8(s) {
        return unescape(encodeURIComponent(s));
    }
    _decode_utf8(s) {
        return decodeURIComponent(escape(s));
    }

    stringField(name, maxLen) {
        this.fields.push({
            name: name,
            type: "string",
            maxLen: maxLen,
            add: function(value) {
                value = this._encode_utf8(value);
                // TODO: throw error if value.length > maxLen
                this._add(value.length, maxLen+1);
                for (let ch of value) {
                    this._add(ch.charCodeAt(0), 256);
                }
            },
            remove: function() {
                let len = this._remove(maxLen+1);
                let str = "";
                for (let i = 0; i < len; i++) {
                    let chCode = this._remove(256);
                    str += String.fromCharCode(Number(chCode));
                }
                return str;
            },
        });
    }

    multiField(name, options) {
        this.fields.push({
            name: name,
            type: "multi",
            options: options,
            add: function(value) {
                for (let i = 0; i < options.length; i++) {
                    if (options[i] == value) {
                        this._add(i, options.length);
                        return;
                    }
                }
                // TODO: throw error about unsupported value
            },
            remove: function() {
                let i = this._remove(options.length);
                return options[i];
            },
        });
    }

    _add(val, base) {
        this.workNum += BigInt(val) * this.factor;
        this.factor *= BigInt(base);
        console.log("add ", val, base, this.workNum);
    }

    _remove(base) {
        let v = this.workNum % BigInt(base);
        this.workNum /= BigInt(base);
        return Number(v);
    }

    _base62(num) {
        let str = "";
        while (num > 0) {
            str = this.base62Alphabet.charAt(Number(num % BigInt(62))) + str;
            num /= BigInt(62);
        }
        return str;
    }

    encode(values) {
        this.workNum = BigInt(0);
        this.factor = BigInt(1);

        this._add(this.nameHash, 256);
        for (let field of this.fields) {
            // TODO: throw an error if field.name does not exist
            let fn = field.add.bind(this);
            fn(values[field.name]);
        }
        this._add(this.nameHash, 256);
        // TODO: make this an actual checksum of the contents?

        this._add(1, 1);

        return this._base62(this.workNum);
    }

    _unbase62(str) {
        let num = BigInt(0);
        for (let ch of str) {
            let i = this.base62Alphabet.indexOf(ch);
            // TODO: throw error if i == -1: illegal char
            num *= BigInt(62);
            num += BigInt(i);
        }
        console.log(num);
        return num;
    }

    decode(str) {
        this.workNum = this._unbase62(str);

        let v = this._remove(256);
        // TODO: throw error if val != this.nameHash

        let values = {};
        for (let field of this.fields) {
            let fn = field.remove.bind(this);
            values[field.name] = fn();
        }

        v = this._remove(256);
        // TODO: throw error if val != this.nameHash

        if (this.workNum != 1) {
            // TODO: throw error
            console.log(this.workNum);
        }

        return values;
    }
}
