FROM opendronemap/odm:gpu as build

RUN pip3 install awscli

COPY entry.sh /

# TODO: Is this strictly necessary?
ENTRYPOINT [ "/entry.sh" ]
