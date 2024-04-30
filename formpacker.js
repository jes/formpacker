class Formpacker {
    fieldSpecStr = null;
    fieldSpecHash = null;
    fields = [];
    hasField = {};

    workNum = null;
    sum = null;
    factor = null;

    base62Alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    constructor() {
        this.fieldSpecStr = "";
        this.fieldSpecHash = 0;
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
            let i = ch.charCodeAt(0) - '0'.charCodeAt(0);
            if (i < 0 || i > 9)
                throw new Error("illegal digit: " + ch);
            this._add(i, 11);
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

    _pushField(name, field) {
        if (name in this.hasField)
            throw new Error("duplicate field '" + name + "'");
        this.hasField[name] = true;
        this.fields.push(field);

        // we construct a string representation of the field spec, and then hash
        // it to create a 1-byte hash of the field spec, so that we have a good
        // chance of detecting the problem if we try to decode data for the
        // wrong field spec
        this.fieldSpecStr += "," + name + ";" + field.type;
        if (field.type == "string")
            this.fieldSpecStr += "-" + field.maxLen;
        else if (field.type == "multi")
            this.fieldSpecStr += "+[" + field.options.join(',') + "]";
        this.fieldSpecHash = this._hashString(this.fieldSpecStr);
    }

    numField(name) {
        this._pushField(name, {
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
                if (fracPart.length == 0)
                    return sign + intPart;
                else
                    return sign + intPart + "." + fracPart;
            },
        });
    }

    boolField(name) {
        this._pushField(name, {
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
        this._pushField(name, {
            name: name,
            type: "string",
            maxLen: maxLen,
            add: function(value) {
                value = this._encode_utf8(value);
                if (value.length > maxLen)
                    throw new Error("string length " + value.length + " exceeds maximum of " + maxLen);
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
                return this._decode_utf8(str);
            },
        });
    }

    multiField(name, options) {
        this._pushField(name, {
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
                throw new Error("option '" + value + "' unknown, expected one of [" + options.join(',') + "]");
            },
            remove: function() {
                let i = this._remove(options.length);
                return options[i];
            },
        });
    }

    _add(val, base) {
        this.sum = (this.sum + val) & 0xff;
        this.workNum += BigInt(val) * this.factor;
        this.factor *= BigInt(base);
    }

    _remove(base) {
        if (this.workNum == 0)
            throw new Error("ran out of working value");
        let val = Number(this.workNum % BigInt(base));
        this.sum = (this.sum + val) & 0xff;
        this.workNum /= BigInt(base);
        return val;
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
        this.sum = 0;

        this._add(this.fieldSpecHash, 256);
        for (let field of this.fields) {
            let fn = field.add.bind(this);
            try {
                if (!field.name in values)
                    throw new Error("'" + field.name + "' does not exist in input values");
                fn(values[field.name]);
            } catch (error) {
                throw new Error("encoding field '" + field.name + "': " + error.message);
            };
        }
        this._add(this.sum, 256);

        this._add(1, 1);

        return this._base62(this.workNum);
    }

    _unbase62(str) {
        let num = BigInt(0);
        for (let ch of str) {
            let i = this.base62Alphabet.indexOf(ch);
            if (i == -1)
                throw new Error("illegal character in decoding base62: '" + ch + "'");
            num *= BigInt(62);
            num += BigInt(i);
        }
        return num;
    }

    decode(str) {
        this.workNum = this._unbase62(str);
        this.sum = 0;

        let hash = this._remove(256);
        if (hash != this.fieldSpecHash)
            throw new Error("incorrect fieldSpecHash (incorrect input?)");

        let values = {};
        for (let field of this.fields) {
            let fn = field.remove.bind(this);
            try {
                values[field.name] = fn();
            } catch (error) {
                throw new Error("decoding field '" + field.name + "': " + error.message);
            }
        }

        // TODO: it would be good to be able to check the checksum first,
        // otherwise we'll more likely give some 'decoding field ...' error on
        // corrupted input, instead of 'incorrect checksum';
        // or perhaps we should stash all (or just one of?) the decoding errors we
        // encountered, and throw it only if the checksum is good
        let expected = this.sum; // XXX: this._remove() modifies this.sum
        let checksum = this._remove(256);
        if (checksum != expected)
            throw new Error("incorrect checksum (corrupted input?), got " + checksum + ", expected " + this.sum);

        if (this.workNum != 1)
            throw new Error("excess value left over after decoding (mismatched field schema?)");

        return values;
    }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined')
    module.exports = Formpacker;
else
    window.Formpacker = Formpacker;
