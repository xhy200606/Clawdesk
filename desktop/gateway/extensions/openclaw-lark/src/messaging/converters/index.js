"use strict";
import { convertAudio } from "./audio";
import { convertShareCalendarEvent, convertCalendar, convertGeneralCalendar } from "./calendar";
import { convertFile } from "./file";
import { convertFolder } from "./folder";
import { convertHongbao } from "./hongbao";
import { convertImage } from "./image";
import { convertInteractive } from "./interactive/index";
import { convertLocation } from "./location";
import { convertMergeForward } from "./merge-forward";
import { convertPost } from "./post";
import { convertShareChat, convertShareUser } from "./share";
import { convertSticker } from "./sticker";
import { convertSystem } from "./system";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Content converter mapping for all Feishu message types.
 */
import { convertText } from "./text";
import { convertTodo } from "./todo";
import { convertUnknown } from "./unknown";
import { convertVideo } from "./video";
import { convertVideoChat } from "./video-chat";
import { convertVote } from "./vote";
export const converters = new Map([
  ["text", convertText],
  ["post", convertPost],
  ["image", convertImage],
  ["file", convertFile],
  ["audio", convertAudio],
  ["video", convertVideo],
  ["media", convertVideo],
  ["sticker", convertSticker],
  ["interactive", convertInteractive],
  ["share_chat", convertShareChat],
  ["share_user", convertShareUser],
  ["location", convertLocation],
  ["merge_forward", convertMergeForward],
  ["folder", convertFolder],
  ["system", convertSystem],
  ["hongbao", convertHongbao],
  ["share_calendar_event", convertShareCalendarEvent],
  ["calendar", convertCalendar],
  ["general_calendar", convertGeneralCalendar],
  ["video_chat", convertVideoChat],
  ["todo", convertTodo],
  ["vote", convertVote],
  ["unknown", convertUnknown],
]);
