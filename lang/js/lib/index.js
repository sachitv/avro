/* jshint node: true */

/**
 *  Licensed to the Apache Software Foundation (ASF) under one
 *  or more contributor license agreements.  See the NOTICE file distributed
 *  with this work for additional information regarding copyright ownership.
 *  The ASF licenses this file to you under the Apache License, Version 2.0
 *  (the "License"); you may not use this file except in compliance with the
 *  License.  You may obtain a copy of the License at
 *
 *  https://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

/**
 * Main node.js entry point.
 *
 */

import * as files from './files.js';
import * as protocols from './protocols.js';
import * as schemas from './schemas.js';
import * as deprecated from '../etc/deprecated/validator.js';

const exported = {
  Type: schemas.Type,
  Protocol: protocols.Protocol,
  parse: files.parse,
  createFileDecoder: files.createFileDecoder,
  createFileEncoder: files.createFileEncoder,
  extractFileHeader: files.extractFileHeader,
  streams: files.streams,
  types: schemas.types,
  Validator: deprecated.Validator,
  ProtocolValidator: deprecated.ProtocolValidator
};

export const Type = schemas.Type;
export const Protocol = protocols.Protocol;
export const parse = files.parse;
export const createFileDecoder = files.createFileDecoder;
export const createFileEncoder = files.createFileEncoder;
export const extractFileHeader = files.extractFileHeader;
export const streams = files.streams;
export const types = schemas.types;
export const Validator = deprecated.Validator;
export const ProtocolValidator = deprecated.ProtocolValidator;

export default exported;
