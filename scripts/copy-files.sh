#!/bin/bash

# Used to copy files to the distribution folder for each extension build

cp js-extension/*.* distr/ && \
cp package.json distr/ && \
cp LICENSE distr/ && \
cp README.md distr/ && \
cp images/fastedge.png distr/
