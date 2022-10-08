FROM opendronemap/odm as build

RUN pip3 install awscli

COPY --chmod=777 entry.sh /

# Override the default ENTRYPOINT from the ODM image
ENTRYPOINT [ "/entry.sh" ]
