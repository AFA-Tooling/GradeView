import { Mime } from 'mime';

const mimeTypes = new Mime();

mimeTypes.define({
    'application/x-concept-map': ['cm'],
});

export default mimeTypes;
