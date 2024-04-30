# Formpacker

Formpacker creates compact copy-pastable representations of form values.

You would show a Formpacker representation in a convenient copyable place near your form, and also have a box
where people can paste in a Formpacker representation to populate the form.

The output takes up substantially less space than base64 of JSON, at the cost of slightly more work in your
code to define the field spec.

As an example, let's take an object like:

    {
        height: 180.52,
        name: "Homer Simpson",
        admin: false,
        department: "tech",
    };

base64 of JSON is:

    eyJoZWlnaHQiOjE4MC41MiwibmFtZSI6IkhvbWVyIFNpbXBzb24iLCJhZG1pbiI6ZmFsc2UsImRlcGFydG1lbnQiOiJ0ZWNoIn0=

Formpacker reduces this to:

    vaICkJVC8LqhWSs7JK8Hyjv4Jj

See below for example code.

## Design goals

The intended purpose is for users to store & share form contents through any text-based channel (e.g.
in plain text files, spreadsheet cells, email, IM, etc.

Design goals include:

 * no special characters, because they are sometimes annoying to select by double-clicking, for example if they are detected as a word boundary
 * output should be reasonably as short as possible
 * detect corrupted inputs and incorrect inputs, instead of creating weird output
 * preserve leading/trailing zero's in numeric values

## Drawbacks

If you change the field spec, then all previous encoded values will no longer work. A suggested solution
is to keep all versions of your Formpacker encoding available, and if decoding with the most recent one fails
by throwing an error, then fall back to the next most recent, etc., until you either successfully decode an object
or run out of possible field specs.

Possible ways to change the field spec include:

 * adding/removing a field
 * changing the order in which you declare the fields
 * changing the name of a field
 * changing the maximum length of a string
 * changing the order of options in a multiple-choice
 * adding/removing a multiple-choice option

## Value types

Supported value types:

 * numeric
 * boolean
 * string
 * multiple choice

## Install

### npm

Install with `npm i formpacker`, and load it like so:

    const Formpacker = require('formpacker'); 
    
    ...

### Script tag

Load Formpacker with a script tag:

    <html><body>
    <script src="formpacker.js"></script>
    <script>
        ...
    </script>
    </body></html>

## Usage

Load Formpacker with either npm or a script tag, as above,
and then:

    let f = new Formpacker();

    // Construct your form representation with these functions.
    // The order you add them is important as it goes directly
    // into the order of the underlying data in the output.
    // The same fields added in a different order will create an
    // incompatible format.
    f.numField("height");
    f.stringField("name", 32); // 32 is maximum length of string
    f.boolField("admin");
    f.multiField("department", ["tech", "sales", "support"]);

    // Create an object containing your form field values, with names
    // matching the ones above.
    let employee = {
        height: 180.52,
        name: "Homer Simpson",
        admin: false,
        department: "tech",
    };

    // Encode an object into a compact string representation.
    let str = f.encode(employee);
    console.log(str); // vaICkJVC8LqhWSs7JK8Hyjv4Jj

    // Decode a string into an object.
    let newEmployee = f.decode(str);
    console.log(newEmployee); // { height: 180.52, name: "Homer Simpson", admin: false, department: "tech" }

## How it works

Formpacker efficiently encodes all of your fields into one large number, and then the string output is
a base62 encoding of the number. (Broadly like base64, but with no special characters).

Also encoded in the large number is a checksum of the field spec, so that it can detect if you try to decode data
with an incorrect field spec, and a checksum of the field contents, so that it can detect corrupted input.

The field types are encoded as follows, which may or may not make sense. Maybe better to read the code.

### Boolean

A base-2 value of either 0 or 1 is added into the bigint.

### Multiple choice

A base-N value i is added into the bigint, where N is the number of choices,
and i is the index of the chosen choice.

### Numbers

First a sign bit is encoded in the same manner as a boolean (true for negative),
and then the integer part of the number is encoded, one decimal digit at a time, but as if it were a base-11 value.
Then a base-11 digit "10" is encoded to signify the end of the integer part, and then the fractional part
is encoded in the same way (base-10 representation, but in base-11 digits, followed by a base-11 "10").

### Strings

The string is encoded with utf-8.

First the length of the string is encoded as a base-N value where N is 1 more than the specified
maximum length of the string. And then each character of the utf-8 string is encoded as a base-256
value.

## Contact

Formpacker is created by James Stanley. You can email me on james@incoherency.co.uk or read my blog at https://incoherency.co.uk/
